import { afterEach, describe, expect, it, vi } from 'vitest';

const createAdminClient = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({ createClient: () => createAdminClient() }));

import { attachOwnerDisplayName } from './space-owner-identity';

/**
 * Builds a fake admin client for the profile and auth-email reads attachOwnerDisplayName makes.
 *
 * @param {Record<string, string|null>} profilesById - display_name per owner id with a profile row
 * @param {Record<string, string|null>} emailById - auth email per owner id
 * @returns {{ client: object, profilesQuery: ReturnType<typeof vi.fn> }}
 */
function fakeAdminClient(profilesById = {}, emailById = {}) {
    const profilesQuery = vi.fn(async (ownerIds) => ({
        data: ownerIds
            .filter((ownerId) => ownerId in profilesById)
            .map((ownerId) => ({ id: ownerId, display_name: profilesById[ownerId] })),
    }));

    const client = {
        from: (table) => {
            if (table !== 'profiles') throw new Error(`unexpected table: ${table}`);
            let ownerIds;
            return {
                select: () => ({
                    in: (_column, ids) => {
                        ownerIds = ids;
                        return profilesQuery(ownerIds);
                    },
                }),
            };
        },
        auth: {
            admin: {
                getUserById: async (ownerId) => ({
                    data: { user: ownerId in emailById ? { email: emailById[ownerId] } : null },
                }),
            },
        },
    };

    return { client, profilesQuery };
}

describe('attachOwnerDisplayName', () => {
    afterEach(() => vi.clearAllMocks());

    it('returns the same array untouched for an empty list, without creating an admin client', async () => {
        const spaces = [];
        const result = await attachOwnerDisplayName(spaces);

        expect(result).toBe(spaces);
        expect(createAdminClient).not.toHaveBeenCalled();
    });

    it('uses the profile display_name when one is set', async () => {
        const { client } = fakeAdminClient({ 'owner-1': 'Alex' });
        createAdminClient.mockReturnValue(client);

        const result = await attachOwnerDisplayName([{ id: 'space-1', owner_id: 'owner-1' }]);

        expect(result).toEqual([
            { id: 'space-1', owner_id: 'owner-1', owner_display_name: 'Alex' },
        ]);
    });

    it('falls back to the auth email when the profile row has no display_name', async () => {
        const { client } = fakeAdminClient(
            { 'owner-1': null },
            { 'owner-1': 'owner1@example.com' },
        );
        createAdminClient.mockReturnValue(client);

        const result = await attachOwnerDisplayName([{ id: 'space-1', owner_id: 'owner-1' }]);

        expect(result[0].owner_display_name).toBe('owner1@example.com');
    });

    it('falls back to the auth email when there is no profile row at all', async () => {
        const { client } = fakeAdminClient({}, { 'owner-1': 'owner1@example.com' });
        createAdminClient.mockReturnValue(client);

        const result = await attachOwnerDisplayName([{ id: 'space-1', owner_id: 'owner-1' }]);

        expect(result[0].owner_display_name).toBe('owner1@example.com');
    });

    it('resolves to null when neither a profile display_name nor an auth email is available', async () => {
        const { client } = fakeAdminClient({}, {});
        createAdminClient.mockReturnValue(client);

        const result = await attachOwnerDisplayName([{ id: 'space-1', owner_id: 'owner-1' }]);

        expect(result[0].owner_display_name).toBeNull();
    });

    it('resolves each space independently when owners differ', async () => {
        const { client } = fakeAdminClient(
            { 'owner-1': 'Alex' },
            { 'owner-2': 'owner2@example.com' },
        );
        createAdminClient.mockReturnValue(client);

        const result = await attachOwnerDisplayName([
            { id: 'space-1', owner_id: 'owner-1' },
            { id: 'space-2', owner_id: 'owner-2' },
        ]);

        expect(result[0].owner_display_name).toBe('Alex');
        expect(result[1].owner_display_name).toBe('owner2@example.com');
    });

    it('queries a shared owner only once across multiple spaces (deduplicated ids)', async () => {
        const { client, profilesQuery } = fakeAdminClient({ 'owner-1': 'Alex' });
        createAdminClient.mockReturnValue(client);

        const result = await attachOwnerDisplayName([
            { id: 'space-1', owner_id: 'owner-1' },
            { id: 'space-2', owner_id: 'owner-1' },
        ]);

        expect(profilesQuery).toHaveBeenCalledTimes(1);
        expect(profilesQuery).toHaveBeenCalledWith(['owner-1']);
        expect(result[0].owner_display_name).toBe('Alex');
        expect(result[1].owner_display_name).toBe('Alex');
    });

    it('keeps every other field on the space untouched', async () => {
        const { client } = fakeAdminClient({ 'owner-1': 'Alex' });
        createAdminClient.mockReturnValue(client);

        const result = await attachOwnerDisplayName([
            { id: 'space-1', owner_id: 'owner-1', name: 'Home', color: '#fff' },
        ]);

        expect(result[0]).toMatchObject({ id: 'space-1', name: 'Home', color: '#fff' });
    });
});
