import { describe, expect, it } from 'vitest';
import { generateInviteToken, hashInviteToken } from './invite-tokens';

describe('generateInviteToken', () => {
    it('returns a raw token whose hash matches the returned tokenHash', () => {
        const { rawToken, tokenHash } = generateInviteToken();
        expect(hashInviteToken(rawToken)).toBe(tokenHash);
    });

    it('returns a URL-safe raw token with no padding or unsafe characters', () => {
        const { rawToken } = generateInviteToken();
        expect(rawToken).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('generates distinct tokens on each call', () => {
        const first = generateInviteToken();
        const second = generateInviteToken();
        expect(first.rawToken).not.toBe(second.rawToken);
        expect(first.tokenHash).not.toBe(second.tokenHash);
    });
});

describe('hashInviteToken', () => {
    it('is deterministic for the same input', () => {
        expect(hashInviteToken('same-token')).toBe(hashInviteToken('same-token'));
    });

    it('produces different hashes for different inputs', () => {
        expect(hashInviteToken('token-a')).not.toBe(hashInviteToken('token-b'));
    });

    it('returns a 64-character hex string (sha256)', () => {
        expect(hashInviteToken('any-token')).toMatch(/^[a-f0-9]{64}$/);
    });
});
