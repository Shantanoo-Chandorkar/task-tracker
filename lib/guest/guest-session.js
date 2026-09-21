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
