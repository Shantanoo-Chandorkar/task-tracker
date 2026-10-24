import { cookies } from 'next/headers';

const CHALLENGE_COOKIE_MAX_AGE_SECONDS = 5 * 60;

export const WEBAUTHN_REGISTRATION_CHALLENGE_COOKIE = 'webauthn_registration_challenge';
export const WEBAUTHN_AUTHENTICATION_CHALLENGE_COOKIE = 'webauthn_authentication_challenge';

/**
 * Stores a WebAuthn ceremony's challenge for 5 minutes, long enough to round-trip through the
 * authenticator and back to the matching verify call.
 *
 * @param {string} cookieName - One of the WEBAUTHN_*_CHALLENGE_COOKIE constants.
 * @param {string} challenge - The base64url challenge from the matching options call.
 * @returns {Promise<void>}
 */
export async function setChallengeCookie(cookieName, challenge) {
    const cookieStore = await cookies();
    cookieStore.set(cookieName, challenge, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: CHALLENGE_COOKIE_MAX_AGE_SECONDS,
    });
}

/**
 * Reads a WebAuthn challenge cookie and deletes it in the same call, so a challenge can never
 * be reused across two verify attempts.
 *
 * @param {string} cookieName - One of the WEBAUTHN_*_CHALLENGE_COOKIE constants.
 * @returns {Promise<string|null>} The stored challenge, or null if it was missing or expired.
 */
export async function readAndClearChallengeCookie(cookieName) {
    const cookieStore = await cookies();
    const challenge = cookieStore.get(cookieName)?.value ?? null;
    cookieStore.delete(cookieName);
    return challenge;
}
