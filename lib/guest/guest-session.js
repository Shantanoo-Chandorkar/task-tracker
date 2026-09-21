import { GUEST_SESSION_MINUTES } from '@/lib/guest/guest-config';

const MILLISECONDS_PER_MINUTE = 60 * 1000;

/**
 * Tells whether a Supabase user is a guest (an anonymous sign-in), as opposed to a registered account.
 *
 * @param {object|null|undefined} user - Supabase user from `getUser()`.
 * @returns {boolean} True only for an anonymous user.
 */
export function isGuestUser(user) {
    return user?.is_anonymous === true;
}

/**
 * Works out when a guest session ends: a fixed window from the moment the guest was created.
 * Uses the server-set `created_at`, never a value the browser could change.
 *
 * @param {object|null|undefined} user - Supabase user from `getUser()`.
 * @returns {Date|null} The expiry time, or null when the user is not a guest or has no usable creation time.
 */
export function getGuestExpiryTime(user) {
    if (!isGuestUser(user)) return null;

    const createdAtMs = Date.parse(user.created_at);
    if (Number.isNaN(createdAtMs)) return null;

    return new Date(createdAtMs + GUEST_SESSION_MINUTES * MILLISECONDS_PER_MINUTE);
}

/**
 * Tells whether a guest's session is over. A guest whose creation time cannot be read counts as expired,
 * so a malformed user can never keep a session alive.
 *
 * @param {object|null|undefined} user - Supabase user from `getUser()`.
 * @param {number} [nowMs] - Current time in milliseconds; only tests pass this.
 * @returns {boolean} True for an expired guest, false for a live guest and for any registered user.
 */
export function isGuestSessionExpired(user, nowMs = Date.now()) {
    if (!isGuestUser(user)) return false;

    const expiryTime = getGuestExpiryTime(user);
    return expiryTime === null || nowMs >= expiryTime.getTime();
}

/**
 * Seconds left in a live guest's session, so the browser countdown does not depend on its own clock.
 *
 * @param {object|null|undefined} user - Supabase user from `getUser()`.
 * @param {number} [nowMs] - Current time in milliseconds; only tests pass this.
 * @returns {number|null} Seconds left (0 once expired), or null when the user is not a guest.
 */
export function getGuestSecondsLeft(user, nowMs = Date.now()) {
    if (!isGuestUser(user)) return null;

    const expiryTime = getGuestExpiryTime(user);
    if (expiryTime === null) return 0;

    return Math.max(0, Math.floor((expiryTime.getTime() - nowMs) / 1000));
}

/**
 * Formats a number of seconds as m:ss for the countdown, for example 1721 becomes "28:41".
 *
 * @param {number} totalSeconds - Seconds to show; negative values show as 0:00.
 * @returns {string} Minutes, a colon, and zero-padded seconds.
 */
export function formatSecondsAsClock(totalSeconds) {
    const wholeSeconds = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(wholeSeconds / 60);
    const seconds = wholeSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
