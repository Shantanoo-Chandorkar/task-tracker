import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({
        from: () => ({
            select: () => ({
                eq: () => ({
                    single: async () => ({ data: { display_name: 'Stored Name' }, error: null }),
                }),
            }),
        }),
    }),
}));

const { GET } = await import('./route');

beforeEach(() => vi.clearAllMocks());

describe('GET /api/profile', () => {
    it('gives a registered user their name and email, and no guest fields set', async () => {
        mocks.getCurrentUser.mockResolvedValue({
            id: 'u1',
            is_anonymous: false,
            email: 'person@example.com',
            created_at: '2020-01-01T00:00:00Z',
        });

        const profileBody = await (await GET()).json();
        expect(profileBody).toEqual({
            display_name: 'Stored Name',
            email: 'person@example.com',
            is_guest: false,
            guest_seconds_left: null,
        });
    });

    it('gives a guest no name or email, the guest flag, and the seconds left in its session', async () => {
        mocks.getCurrentUser.mockResolvedValue({
            id: 'g1',
            is_anonymous: true,
            email: null,
            created_at: new Date(Date.now() - 60 * 1000).toISOString(),
        });

        const profileBody = await (await GET()).json();
        expect(profileBody.is_guest).toBe(true);
        expect(profileBody.display_name).toBeNull();
        expect(profileBody.email).toBeNull();
        expect(profileBody.guest_seconds_left).toBeGreaterThan(1700);
        expect(profileBody.guest_seconds_left).toBeLessThanOrEqual(1740);
    });

    it('answers 401 for a logged-out visitor, with no profile data', async () => {
        mocks.getCurrentUser.mockResolvedValue(null);

        const response = await GET();
        expect(response.status).toBe(401);
        expect(await response.json()).not.toHaveProperty('is_guest');
    });
});
