import { afterEach, describe, expect, it, vi } from 'vitest';

const createClient = vi.fn();
const isGuestSessionExpired = vi.fn();

vi.mock('@/lib/supabase/server', () => ({ createClient: () => createClient() }));
vi.mock('@/lib/guest/guest-session', () => ({
    isGuestSessionExpired: (user) => isGuestSessionExpired(user),
}));

import { getCurrentUser } from './session';

function supabaseReturning(user) {
    return { auth: { getUser: async () => ({ data: { user } }) } };
}

describe('getCurrentUser', () => {
    afterEach(() => vi.clearAllMocks());

    it('returns the signed-in user when the session is live and not an expired guest', async () => {
        const user = { id: 'user-1', is_anonymous: false };
        createClient.mockResolvedValue(supabaseReturning(user));
        isGuestSessionExpired.mockReturnValue(false);

        expect(await getCurrentUser()).toBe(user);
    });

    it('returns null when there is no session user', async () => {
        createClient.mockResolvedValue(supabaseReturning(null));

        expect(await getCurrentUser()).toBeNull();
        expect(isGuestSessionExpired).not.toHaveBeenCalled();
    });

    it('returns null when the session user is undefined', async () => {
        createClient.mockResolvedValue(supabaseReturning(undefined));

        expect(await getCurrentUser()).toBeNull();
    });

    it('returns null for an expired guest, even though a session user exists', async () => {
        const expiredGuest = { id: 'guest-1', is_anonymous: true };
        createClient.mockResolvedValue(supabaseReturning(expiredGuest));
        isGuestSessionExpired.mockReturnValue(true);

        expect(await getCurrentUser()).toBeNull();
        expect(isGuestSessionExpired).toHaveBeenCalledWith(expiredGuest);
    });

    it('returns the user for a guest whose session has not expired', async () => {
        const liveGuest = { id: 'guest-2', is_anonymous: true };
        createClient.mockResolvedValue(supabaseReturning(liveGuest));
        isGuestSessionExpired.mockReturnValue(false);

        expect(await getCurrentUser()).toBe(liveGuest);
    });

    it('propagates a thrown error from creating the client, rather than swallowing it', async () => {
        createClient.mockRejectedValue(new Error('offline'));

        await expect(getCurrentUser()).rejects.toThrow('offline');
    });
});
