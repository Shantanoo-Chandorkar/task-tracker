'use server';

import { headers } from 'next/headers';
import {
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { AUTH_ERROR_CODES } from '@/lib/auth/error-codes';
import {
    checkRateLimit,
    recordFailedAttempt,
    resetAttempts,
    getClientIp,
    LOCKOUT_ERROR_MESSAGE,
} from '@/lib/auth/rate-limit';
import { logAuthFailure } from '@/lib/auth/log-auth-failure';
import { getWebauthnOrigin, getWebauthnRpId } from '@/lib/webauthn/config';
import {
    WEBAUTHN_AUTHENTICATION_CHALLENGE_COOKIE,
    setChallengeCookie,
    readAndClearChallengeCookie,
} from '@/lib/webauthn/challenge-cookies';
import { decodeBytesFromBytea } from '@/lib/webauthn/credential-encoding';
import { logClientCeremonyFailure } from '@/lib/webauthn/log-client-ceremony-failure';

// No user exists yet for a lockout key in this anonymous flow, so every call here is IP-only.
const WEBAUTHN_LOGIN_RATE_LIMIT_ACTION = 'webauthn_auth_verify';
const ANONYMOUS_RATE_LIMIT_EMAIL = '';

/**
 * Builds the options for `navigator.credentials.get()` and stores the challenge cookie.
 *
 * Also checks (never increments) the verify step's own lockout counter, closing that window too.
 *
 * @returns {Promise<{ data: object|null, error: string|null, code: string|null }>}
 */
export async function getPasskeyAuthenticationOptionsAction() {
    const ipAddress = getClientIp(await headers());

    try {
        const { isLocked, retryAfterMinutes } = await checkRateLimit(
            WEBAUTHN_LOGIN_RATE_LIMIT_ACTION,
            ANONYMOUS_RATE_LIMIT_EMAIL,
            ipAddress,
        );
        if (isLocked) {
            return {
                data: null,
                error: LOCKOUT_ERROR_MESSAGE(retryAfterMinutes),
                code: AUTH_ERROR_CODES.ACCOUNT_LOCKED,
            };
        }

        // allowCredentials stays empty - the browser offers this RP ID's resident keys, not the server.
        const options = await generateAuthenticationOptions({
            rpID: getWebauthnRpId(),
            allowCredentials: [],
            userVerification: 'required',
        });

        await setChallengeCookie(WEBAUTHN_AUTHENTICATION_CHALLENGE_COOKIE, options.challenge);
        return { data: options, error: null, code: null };
    } catch (thrown) {
        logAuthFailure(AUTH_ERROR_CODES.WEBAUTHN_AUTHENTICATION_FAILED, thrown?.message);
        return {
            data: null,
            error: 'Could not start passkey login. Please try again.',
            code: AUTH_ERROR_CODES.WEBAUTHN_AUTHENTICATION_FAILED,
        };
    }
}

/**
 * Verifies a completed authentication ceremony and, on success, mints a real session cookie.
 *
 * @param {object} fields
 * @param {object} fields.assertionResponse - The browser's startAuthentication() result.
 * @returns {Promise<{ error: string|null, code: string|null }>} Null error means a session cookie is now set.
 */
export async function verifyPasskeyAuthenticationAction(fields) {
    const ipAddress = getClientIp(await headers());

    try {
        const { isLocked, retryAfterMinutes } = await checkRateLimit(
            WEBAUTHN_LOGIN_RATE_LIMIT_ACTION,
            ANONYMOUS_RATE_LIMIT_EMAIL,
            ipAddress,
        );
        if (isLocked) {
            return {
                error: LOCKOUT_ERROR_MESSAGE(retryAfterMinutes),
                code: AUTH_ERROR_CODES.ACCOUNT_LOCKED,
            };
        }

        const challenge = await readAndClearChallengeCookie(
            WEBAUTHN_AUTHENTICATION_CHALLENGE_COOKIE,
        );
        if (!challenge) {
            // A UX hiccup (expired tab, second device), not a credential-guessing signal -- never counted.
            return {
                error: 'Your passkey login took too long. Please try again.',
                code: AUTH_ERROR_CODES.WEBAUTHN_CHALLENGE_MISSING,
            };
        }

        const adminClient = createAdminClient();
        // No session exists yet to scope this by RLS -- discovering who this is is the whole point.
        const { data: credentialRow, error: lookupError } = await adminClient
            .from('webauthn_credentials')
            .select('id, user_id, credential_id, public_key, sign_count, transports')
            .eq('credential_id', fields.assertionResponse.id)
            .maybeSingle();

        if (lookupError || !credentialRow) {
            await recordFailedAttempt(
                WEBAUTHN_LOGIN_RATE_LIMIT_ACTION,
                ANONYMOUS_RATE_LIMIT_EMAIL,
                ipAddress,
            );
            // Generic, never "unknown credential" - same enumeration-resistance reasoning as signInAction.
            return {
                error: 'Could not verify that passkey. Please try again.',
                code: AUTH_ERROR_CODES.WEBAUTHN_AUTHENTICATION_FAILED,
            };
        }

        let verification;
        try {
            verification = await verifyAuthenticationResponse({
                response: fields.assertionResponse,
                expectedChallenge: challenge,
                expectedOrigin: getWebauthnOrigin(),
                expectedRPID: getWebauthnRpId(),
                credential: {
                    id: credentialRow.credential_id,
                    publicKey: decodeBytesFromBytea(credentialRow.public_key),
                    counter: credentialRow.sign_count,
                    transports: credentialRow.transports ?? undefined,
                },
                requireUserVerification: true,
            });
        } catch (thrown) {
            console.error('[webauthn] authentication-verify threw', { detail: thrown?.message });
            await recordFailedAttempt(
                WEBAUTHN_LOGIN_RATE_LIMIT_ACTION,
                ANONYMOUS_RATE_LIMIT_EMAIL,
                ipAddress,
            );
            return {
                error: 'Could not verify that passkey. Please try again.',
                code: AUTH_ERROR_CODES.WEBAUTHN_AUTHENTICATION_FAILED,
            };
        }
        if (!verification.verified) {
            await recordFailedAttempt(
                WEBAUTHN_LOGIN_RATE_LIMIT_ACTION,
                ANONYMOUS_RATE_LIMIT_EMAIL,
                ipAddress,
            );
            return {
                error: 'Could not verify that passkey. Please try again.',
                code: AUTH_ERROR_CODES.WEBAUTHN_AUTHENTICATION_FAILED,
            };
        }

        const { newCounter } = verification.authenticationInfo;
        // Synced passkeys report a flat 0 forever - only a non-zero-to-non-zero drop is a real clone signal.
        const isCloneRegression =
            credentialRow.sign_count !== 0 &&
            newCounter !== 0 &&
            newCounter <= credentialRow.sign_count;
        if (isCloneRegression) {
            console.error('[webauthn] possible cloned credential detected', {
                credentialId: credentialRow.credential_id,
                storedCount: credentialRow.sign_count,
                newCount: newCounter,
            });
            await recordFailedAttempt(
                WEBAUTHN_LOGIN_RATE_LIMIT_ACTION,
                ANONYMOUS_RATE_LIMIT_EMAIL,
                ipAddress,
            );
            return {
                error: 'Could not verify that passkey. Please try again.',
                code: AUTH_ERROR_CODES.WEBAUTHN_AUTHENTICATION_FAILED,
            };
        }

        // The cryptographic proof of possession already happened, independent of session minting below.
        const { error: updateError } = await adminClient
            .from('webauthn_credentials')
            .update({ sign_count: newCounter, last_used_at: new Date().toISOString() })
            .eq('id', credentialRow.id);
        if (updateError) {
            console.error('[webauthn] could not update sign_count/last_used_at', {
                detail: updateError.message,
            });
        }

        // ON DELETE CASCADE means this row can't outlive its user - a failure here is a genuine server fault.
        const { data: userLookup, error: userLookupError } =
            await adminClient.auth.admin.getUserById(credentialRow.user_id);
        if (userLookupError || !userLookup?.user?.email) {
            console.error('[webauthn] could not resolve the credential owner', {
                detail: userLookupError?.message,
            });
            return {
                error: 'Could not sign you in. Please try again.',
                code: AUTH_ERROR_CODES.WEBAUTHN_SESSION_MINT_FAILED,
            };
        }

        const { data: generatedLink, error: generateLinkError } =
            await adminClient.auth.admin.generateLink({
                type: 'magiclink',
                email: userLookup.user.email,
            });
        if (generateLinkError) {
            console.error('[webauthn] could not generate a session-mint link', {
                detail: generateLinkError.message,
            });
            return {
                error: 'Could not sign you in. Please try again.',
                code: AUTH_ERROR_CODES.WEBAUTHN_SESSION_MINT_FAILED,
            };
        }

        const sessionClient = await createSessionClient();
        const { error: verifyOtpError } = await sessionClient.auth.verifyOtp({
            type: 'magiclink',
            token_hash: generatedLink.properties.hashed_token,
        });
        if (verifyOtpError) {
            console.error('[webauthn] could not mint a session from the link', {
                detail: verifyOtpError.message,
            });
            return {
                error: 'Could not sign you in. Please try again.',
                code: AUTH_ERROR_CODES.WEBAUTHN_SESSION_MINT_FAILED,
            };
        }

        await resetAttempts(
            WEBAUTHN_LOGIN_RATE_LIMIT_ACTION,
            ANONYMOUS_RATE_LIMIT_EMAIL,
            ipAddress,
        );
        return { error: null, code: null };
    } catch (thrown) {
        logAuthFailure(AUTH_ERROR_CODES.WEBAUTHN_AUTHENTICATION_FAILED, thrown?.message);
        return {
            error: 'Unexpected error signing in with your passkey',
            code: AUTH_ERROR_CODES.WEBAUTHN_AUTHENTICATION_FAILED,
        };
    }
}

/**
 * Reports a login ceremony that failed entirely in the browser, for server-side logging only.
 *
 * Never fails loudly back to the client - logging is this action's only job.
 *
 * @param {object} fields
 * @param {string} fields.errorName - The browser error's `.name`.
 * @param {string} fields.errorMessage - The browser error's `.message`.
 * @returns {Promise<{ error: string|null, code: string|null }>}
 */
export async function reportPasskeyLoginFailureAction(fields) {
    try {
        logClientCeremonyFailure('authentication', {
            errorName: fields.errorName,
            errorMessage: fields.errorMessage,
            userAgent: (await headers()).get('user-agent'),
        });
    } catch (thrown) {
        console.error('[webauthn] could not log a client-side authentication failure', {
            detail: thrown?.message,
        });
    }
    return { error: null, code: null };
}
