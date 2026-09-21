'use server';

import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
import { getClientIp } from '@/lib/auth/rate-limit';
import { takeGuestCreationSlot } from '@/lib/guest/guest-rate-limit';
import { seedGuestSpace } from '@/lib/guest/seed-guest-space';
import { verifyTurnstileToken } from '@/lib/guest/verify-turnstile';
import { GUEST_ERROR_CODES } from '@/lib/guest/guest-error-codes';

const CAPTCHA_TOKEN_MAX_LENGTH = 2048;

/**
 * Logs a guest failure with its code and cause, never the caller's IP or token.
 *
 * @param {string} code - One of GUEST_ERROR_CODES.
 * @param {string} [detail] - Underlying error message.
 */
function logGuestFailure(code, detail) {
    console.error('[guest] start failed', { code, detail });
}

/**
 * Removes a guest that was created but could not be set up, so no half-built account is left behind.
 * Deleting the user cascades to anything already inserted for them.
 *
 * @param {string} guestUserId - Id of the anonymous user to delete.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Session client, signed out to drop the cookies.
 */
async function discardGuest(guestUserId, supabase) {
    try {
        await createAdminClient().auth.admin.deleteUser(guestUserId);
        await supabase.auth.signOut();
    } catch (thrown) {
        console.error('[guest] cleanup failed', { detail: thrown?.message });
    }
}

/**
 * Starts a guest session: an anonymous user with its own pre-seeded space, no account needed.
 * Callable while logged out, so it is throttled per IP and, when configured, needs a verified Turnstile token.
 *
 * @param {string|null} captchaToken - Cloudflare Turnstile token from the browser.
 * @returns {Promise<{ error: string|null, code: string|null }>} Null error on success; the browser then holds the
 *   guest session cookies.
 */
export async function startGuestSession(captchaToken) {
    try {
        if (await getCurrentUser()) {
            return { error: 'You are already signed in.', code: GUEST_ERROR_CODES.ALREADY_SIGNED_IN };
        }

        // The site key being set is what says the security check is switched on
        const isCaptchaConfigured = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
        const cleanCaptchaToken =
            typeof captchaToken === 'string' && captchaToken.length <= CAPTCHA_TOKEN_MAX_LENGTH ? captchaToken : null;
        if (isCaptchaConfigured && !cleanCaptchaToken) {
            return { error: 'Complete the security check and try again.', code: GUEST_ERROR_CODES.CAPTCHA_FAILED };
        }

        const clientIp = getClientIp(await headers());
        const slot = await takeGuestCreationSlot(clientIp);
        if (slot.status === 'limited') {
            return {
                error: `Too many guest sessions from your network. Try again in ${slot.retryAfterMinutes} minutes.`,
                code: GUEST_ERROR_CODES.RATE_LIMITED,
            };
        }
        if (slot.status === 'unavailable') {
            logGuestFailure(GUEST_ERROR_CODES.START_FAILED, 'rate limit unavailable');
            return { error: 'Could not start a guest session. Please try again.', code: GUEST_ERROR_CODES.START_FAILED };
        }

        // Checked after the IP limit, so a bot sending fake tokens uses up its own quota, not calls to Cloudflare
        if (isCaptchaConfigured && !(await verifyTurnstileToken(cleanCaptchaToken, clientIp))) {
            logGuestFailure(GUEST_ERROR_CODES.CAPTCHA_FAILED, 'turnstile verification failed');
            return { error: 'The security check failed. Please try again.', code: GUEST_ERROR_CODES.CAPTCHA_FAILED };
        }

        const supabase = await createClient();
        const { data: signInData, error: signInError } = await supabase.auth.signInAnonymously();

        if (signInError || !signInData?.user) {
            logGuestFailure(GUEST_ERROR_CODES.START_FAILED, signInError?.message);
            return { error: 'Could not start a guest session. Please try again.', code: GUEST_ERROR_CODES.START_FAILED };
        }

        try {
            await seedGuestSpace(createAdminClient(), signInData.user.id);
        } catch (seedError) {
            logGuestFailure(GUEST_ERROR_CODES.START_FAILED, seedError?.message);
            await discardGuest(signInData.user.id, supabase);
            return { error: 'Could not start a guest session. Please try again.', code: GUEST_ERROR_CODES.START_FAILED };
        }

        return { error: null, code: null };
    } catch (thrown) {
        logGuestFailure(GUEST_ERROR_CODES.START_FAILED, thrown?.message);
        return { error: 'Could not start a guest session. Please try again.', code: GUEST_ERROR_CODES.START_FAILED };
    }
}
