import { describe, expect, it } from 'vitest';
import { blockGuestAction } from './guest-guards';
import { GUEST_ERROR_CODES } from './guest-error-codes';

describe('blockGuestAction', () => {
    it('refuses a guest with the not-allowed code and a plain message', () => {
        const refusal = blockGuestAction({ id: 'g', is_anonymous: true });
        expect(refusal.code).toBe(GUEST_ERROR_CODES.ACTION_NOT_ALLOWED);
        expect(refusal.error).toMatch(/guest mode/i);
    });

    it('lets a registered user through', () => {
        expect(blockGuestAction({ id: 'u', is_anonymous: false, email: 'a@b.com' })).toBeNull();
    });

    it('lets through a user with no anonymous flag, or no user at all, leaving the login check to the caller', () => {
        expect(blockGuestAction({ id: 'u' })).toBeNull();
        expect(blockGuestAction(null)).toBeNull();
        expect(blockGuestAction(undefined)).toBeNull();
    });

    it('does not treat a truthy non-boolean flag as a guest', () => {
        expect(blockGuestAction({ is_anonymous: 'true' })).toBeNull();
    });

    it('reveals nothing about the user or the database in its message', () => {
        const refusal = blockGuestAction({ id: 'secret-id', is_anonymous: true, email: null });
        expect(JSON.stringify(refusal)).not.toContain('secret-id');
    });
});
