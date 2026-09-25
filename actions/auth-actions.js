'use server';

import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
import { blockGuestAction } from '@/lib/guest/guest-guards';
import { AUTH_ERROR_CODES } from '@/lib/auth/error-codes';
import {
    checkRateLimit,
    recordFailedAttempt,
    resetAttempts,
    getClientIp,
} from '@/lib/auth/rate-limit';
import { sendPasswordResetEmail } from '@/lib/email/notifications/send-password-reset-email';
import { sendSignupConfirmationEmail } from '@/lib/email/notifications/send-signup-confirmation-email';
import { sendExistingAccountEmail } from '@/lib/email/notifications/send-existing-account-email';
import { sanitizeString, checkMaxLength, sanitizeRedirectPath } from '@/lib/validation';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Length over composition rules (NIST 800-63B, OWASP) -- no forced uppercase/symbol/number.
const MIN_PASSWORD_LENGTH = 12;
const LOCKOUT_ERROR_MESSAGE = (minutes) =>
    `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;

/**
 * Logs an auth failure server-side with enough context to investigate, never the password.
 *
 * @param {string} code - One of AUTH_ERROR_CODES
 * @param {string} email - The email involved (already trimmed/lowercased by the caller)
 * @param {string} detail - The underlying error message, if any
 */
function logAuthFailure(code, email, detail) {
    console.warn(`[auth] ${code}`, { email, detail });
}

/**
 * Creates an unconfirmed account; the response is identical for already-registered emails to block enumeration.
 *
 * @param {object} fields
 * @param {string} fields.email - Address to register.
 * @param {string} fields.password - Chosen password.
 * @param {string} fields.displayName - Name shown in the app, max 50 characters.
 * @param {string} [fields.redirectPath] - Where the signup-confirmation link should land after
 *   verification (e.g. back on an invite-accept page). Re-sanitized here, server-side --
 *   never trust a client-passed value even one built from an already-sanitized prop.
 * @returns {Promise<{ error: string|null, code: string|null }>} Null error means "check your email", never a session.
 */
export async function signUpAction(fields) {
    const email = fields.email?.trim().toLowerCase() ?? '';
    const password = fields.password ?? '';
    const displayName = sanitizeString(fields.displayName ?? '');
    const redirectPath = sanitizeRedirectPath(fields.redirectPath);

    if (!EMAIL_PATTERN.test(email)) {
        return { error: 'Enter a valid email address', code: AUTH_ERROR_CODES.EMAIL_INVALID };
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
        return {
            error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
            code: AUTH_ERROR_CODES.PASSWORD_TOO_SHORT,
        };
    }
    if (!displayName) {
        return { error: 'Enter your name', code: AUTH_ERROR_CODES.DISPLAY_NAME_REQUIRED };
    }

    const lengthError = checkMaxLength(displayName, 50, 'Name');
    if (lengthError) return lengthError;

    const ipAddress = getClientIp(await headers());

    try {
        const { isLocked, retryAfterMinutes } = await checkRateLimit('signup', email, ipAddress);
        if (isLocked) {
            return {
                error: LOCKOUT_ERROR_MESSAGE(retryAfterMinutes),
                code: AUTH_ERROR_CODES.ACCOUNT_LOCKED,
            };
        }

        // Runs on every attempt, not just failures -- the only thing stopping signup-email mailbombing.
        await recordFailedAttempt('signup', email, ipAddress);

        const supabase = createAdminClient();
        // handle_new_user() (migration 0005) reads this into profiles.display_name on insert.
        const { data: generatedLink, error: generateLinkError } =
            await supabase.auth.admin.generateLink({
                type: 'signup',
                email,
                password,
                options: { data: { display_name: displayName } },
            });

        if (generateLinkError) {
            if (generateLinkError.code === 'user_already_exists') {
                const { data: recoveryLink } = await supabase.auth.admin.generateLink({
                    type: 'recovery',
                    email,
                    options: {
                        redirectTo: `${process.env.SITE_URL}/auth/confirm?next=/reset-password`,
                    },
                });
                if (recoveryLink) {
                    const loginLink = `${process.env.SITE_URL}/auth/confirm?token_hash=${recoveryLink.properties.hashed_token}&type=recovery&next=/reset-password`;
                    await sendExistingAccountEmail(email, loginLink);
                }
                // Same response as a fresh signup - this is what prevents account enumeration
                return { error: null, code: null };
            }
            logAuthFailure(AUTH_ERROR_CODES.SIGNUP_FAILED, email, generateLinkError.message);
            return { error: 'Failed to create account', code: AUTH_ERROR_CODES.SIGNUP_FAILED };
        }

        const confirmLink = `${process.env.SITE_URL}/auth/confirm?token_hash=${generatedLink.properties.hashed_token}&type=signup&next=${encodeURIComponent(redirectPath)}`;
        await sendSignupConfirmationEmail(email, confirmLink);

        return { error: null, code: null };
    } catch (thrown) {
        logAuthFailure(AUTH_ERROR_CODES.SIGNUP_FAILED, email, thrown?.message);
        return { error: 'Unexpected error creating account', code: AUTH_ERROR_CODES.SIGNUP_FAILED };
    }
}

/**
 * Signs in with email/password.
 *
 * @param {object} fields
 * @param {string} fields.email
 * @param {string} fields.password
 * @returns {Promise<{ error: string|null, code: string|null }>}
 */
export async function signInAction(fields) {
    const email = fields.email?.trim().toLowerCase() ?? '';
    const password = fields.password ?? '';

    if (!email || !password) {
        return { error: 'Invalid email or password', code: AUTH_ERROR_CODES.INVALID_CREDENTIALS };
    }

    const ipAddress = getClientIp(await headers());
    try {
        const { isLocked, retryAfterMinutes } = await checkRateLimit('signin', email, ipAddress);
        if (isLocked) {
            return {
                error: LOCKOUT_ERROR_MESSAGE(retryAfterMinutes),
                code: AUTH_ERROR_CODES.ACCOUNT_LOCKED,
            };
        }

        const supabase = await createClient();
        const { error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            // Unconfirmed email still counts toward the lockout below -- not a free, unthrottled probe.
            logAuthFailure(AUTH_ERROR_CODES.SIGNIN_FAILED, email, error.message);
            await recordFailedAttempt('signin', email, ipAddress);
            if (error.message === 'Email not confirmed') {
                return {
                    error: 'Confirm your email before logging in. Check your inbox for the link.',
                    code: AUTH_ERROR_CODES.EMAIL_NOT_CONFIRMED,
                };
            }
            return {
                error: 'Invalid email or password',
                code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
            };
        }

        await resetAttempts('signin', email, ipAddress);
        return { error: null, code: null };
    } catch (thrown) {
        logAuthFailure(AUTH_ERROR_CODES.SIGNIN_FAILED, email, thrown?.message);
        return { error: 'Unexpected error signing in', code: AUTH_ERROR_CODES.SIGNIN_FAILED };
    }
}

/**
 * Signs out the current session.
 *
 * @returns {Promise<{ error: string|null, code: string|null }>}
 */
export async function signOutAction() {
    try {
        const supabase = await createClient();
        const { error } = await supabase.auth.signOut();

        if (error) {
            logAuthFailure(AUTH_ERROR_CODES.SIGNOUT_FAILED, null, error.message);
            return { error: 'Failed to sign out', code: AUTH_ERROR_CODES.SIGNOUT_FAILED };
        }

        return { error: null, code: null };
    } catch (thrown) {
        logAuthFailure(AUTH_ERROR_CODES.SIGNOUT_FAILED, null, thrown?.message);
        return { error: 'Unexpected error signing out', code: AUTH_ERROR_CODES.SIGNOUT_FAILED };
    }
}

/**
 * Requests a password-reset email. Always returns the same generic response regardless of
 * whether the account exists - the account-enumeration protection this bucket exists to add.
 *
 * @param {object} fields
 * @param {string} fields.email
 * @returns {Promise<{ error: string|null, code: string|null }>}
 */
export async function requestPasswordResetAction(fields) {
    const email = fields.email?.trim().toLowerCase() ?? '';

    if (!EMAIL_PATTERN.test(email)) {
        return { error: 'Enter a valid email address', code: AUTH_ERROR_CODES.EMAIL_INVALID };
    }

    const ipAddress = getClientIp(await headers());

    try {
        const { isLocked, retryAfterMinutes } = await checkRateLimit(
            'password_reset',
            email,
            ipAddress,
        );
        if (isLocked) {
            return {
                error: LOCKOUT_ERROR_MESSAGE(retryAfterMinutes),
                code: AUTH_ERROR_CODES.ACCOUNT_LOCKED,
            };
        }

        // Runs on every call, not just failures -- the only thing stopping reset-link mailbombing.
        await recordFailedAttempt('password_reset', email, ipAddress);

        const supabase = createAdminClient();
        const { data: generatedLink, error } = await supabase.auth.admin.generateLink({
            type: 'recovery',
            email,
            options: { redirectTo: `${process.env.SITE_URL}/auth/confirm?next=/reset-password` },
        });

        if (error) {
            // Includes "user not found" -- swallowed silently, same generic response either way.
            logAuthFailure(AUTH_ERROR_CODES.RESET_REQUEST_FAILED, email, error.message);
        } else {
            // Our own /auth/confirm verifies hashed_token and sets the session -- skips Supabase's own redirect hop.
            const resetLink = `${process.env.SITE_URL}/auth/confirm?token_hash=${generatedLink.properties.hashed_token}&type=recovery&next=/reset-password`;
            await sendPasswordResetEmail(email, resetLink);
        }

        return { error: null, code: null };
    } catch (thrown) {
        logAuthFailure(AUTH_ERROR_CODES.RESET_REQUEST_FAILED, email, thrown?.message);
        // Still the generic shape -- an unexpected throw must not read differently than "email didn't exist".
        return { error: null, code: null };
    }
}

/**
 * Sets a new password for the current (recovery) session, established by /auth/confirm
 * after the user clicks their reset-link email.
 *
 * @param {object} fields
 * @param {string} fields.newPassword
 * @returns {Promise<{ error: string|null, code: string|null }>}
 */
export async function updatePasswordAction(fields) {
    const newPassword = fields.newPassword ?? '';

    const user = await getCurrentUser();
    if (!user) {
        return {
            error: 'This link has expired. Request a new one.',
            code: AUTH_ERROR_CODES.RESET_TOKEN_INVALID,
        };
    }

    const guestBlock = blockGuestAction(user);
    if (guestBlock) return guestBlock;

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
        return {
            error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
            code: AUTH_ERROR_CODES.PASSWORD_TOO_SHORT,
        };
    }

    const ipAddress = getClientIp(await headers());

    try {
        const supabase = await createClient();
        const { error } = await supabase.auth.updateUser({ password: newPassword });

        if (error) {
            logAuthFailure(AUTH_ERROR_CODES.PASSWORD_UPDATE_FAILED, user.email, error.message);
            return {
                error: 'Failed to update password',
                code: AUTH_ERROR_CODES.PASSWORD_UPDATE_FAILED,
            };
        }

        await resetAttempts('password_reset', user.email, ipAddress);
        return { error: null, code: null };
    } catch (thrown) {
        logAuthFailure(AUTH_ERROR_CODES.PASSWORD_UPDATE_FAILED, user.email, thrown?.message);
        return {
            error: 'Unexpected error updating password',
            code: AUTH_ERROR_CODES.PASSWORD_UPDATE_FAILED,
        };
    }
}
