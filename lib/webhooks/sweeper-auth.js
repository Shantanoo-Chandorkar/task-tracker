import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Checks the sweeper's shared secret in constant time; both sides are hashed so lengths are never compared.
 *
 * @param {string|null} authorizationHeader - Raw `Authorization` header from the request.
 * @param {string|undefined} expectedSecret - `WEBHOOK_SWEEPER_SECRET` from the environment.
 * @returns {boolean} True only when a secret is configured and the header is exactly `Bearer <secret>`.
 */
export function isSweeperRequestAuthorized(authorizationHeader, expectedSecret) {
    if (!expectedSecret || !authorizationHeader) return false;
    const digestOf = (textToHash) => createHash('sha256').update(textToHash).digest();
    return timingSafeEqual(digestOf(authorizationHeader), digestOf(`Bearer ${expectedSecret}`));
}
