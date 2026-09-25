import { randomBytes, createHash } from 'node:crypto';

/**
 * Generates a fresh space-invite token. Only the hash is ever persisted -- the raw token exists
 * solely in the emailed URL and briefly in memory during redemption.
 *
 * @returns {{ rawToken: string, tokenHash: string }} URL-safe raw token and its sha256 hex hash.
 */
export function generateInviteToken() {
    const rawToken = randomBytes(32).toString('base64url');
    return { rawToken, tokenHash: hashInviteToken(rawToken) };
}

/**
 * Hashes a raw invite token for lookup/comparison against the stored token_hash.
 *
 * @param {string} rawToken - Token as received from the accept-invite URL.
 * @returns {string} sha256 hex digest.
 */
export function hashInviteToken(rawToken) {
    return createHash('sha256').update(rawToken).digest('hex');
}
