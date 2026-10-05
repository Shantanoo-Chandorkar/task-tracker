import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    attachMyPermissionLevel,
    blockCreateForPermission,
    blockWriteForPermission,
    getSpaceIdForList,
    getSpaceIdForSublist,
    getSpaceIdForTask,
    resolveSpacePermission,
} from './space-permissions';
import { SERVER_LOAD_FAILED } from '@/lib/error-codes';

/** Stand-in client that answers every query on a table with the result the test chose, errors included. */
function clientAnswering(resultsByTable) {
    return {
        from(tableName) {
            const tableResult = resultsByTable[tableName];
            const queryBuilder = {
                select: () => queryBuilder,
                eq: () => queryBuilder,
                maybeSingle: async () => tableResult,
                then: (resolve) => resolve(tableResult),
            };
            return queryBuilder;
        },
    };
}

const OUTAGE = { data: null, error: { code: '57014', message: 'statement timeout' } };
const MALFORMED_ID = { data: null, error: { code: '22P02', message: 'invalid input syntax' } };

describe('blockCreateForPermission', () => {
    it.each([
        ['owner', null],
        ['full', null],
        ['restricted', null],
        ['read_only', 'PERMISSION_READ_ONLY'],
        [null, 'PERMISSION_NOT_A_MEMBER'],
    ])('tier %s', (permissionLevel, expectedCode) => {
        const refusal = blockCreateForPermission(permissionLevel);

        expect(refusal?.code ?? null).toBe(expectedCode);
    });
});

describe('blockWriteForPermission', () => {
    it.each([
        ['owner', true, null],
        ['owner', false, null],
        ['full', true, null],
        ['full', false, null],
        ['restricted', true, null],
        ['restricted', false, 'PERMISSION_RESTRICTED_NOT_OWN'],
        ['read_only', true, 'PERMISSION_READ_ONLY'],
        ['read_only', false, 'PERMISSION_READ_ONLY'],
        [null, true, 'PERMISSION_NOT_A_MEMBER'],
        [null, false, 'PERMISSION_NOT_A_MEMBER'],
    ])('tier %s, caller created the row: %s', (permissionLevel, isOwnRow, expectedCode) => {
        const refusal = blockWriteForPermission(permissionLevel, { isOwnRow });

        expect(refusal?.code ?? null).toBe(expectedCode);
    });

    it('always gives a human-readable message with the refusal', () => {
        expect(blockWriteForPermission('read_only', { isOwnRow: false }).error).toMatch(
            /read-only/i,
        );
    });
});

describe('permission reads', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('resolves the owner without reading collaborators', async () => {
        const supabase = clientAnswering({
            spaces: { data: { owner_id: 'user-1' }, error: null },
            space_collaborators: OUTAGE,
        });

        expect(await resolveSpacePermission(supabase, 'space-1', 'user-1')).toBe('owner');
    });

    it('resolves a collaborator tier, and null for a stranger', async () => {
        const collaboratorClient = clientAnswering({
            spaces: { data: { owner_id: 'someone-else' }, error: null },
            space_collaborators: { data: { permission_level: 'restricted' }, error: null },
        });
        const strangerClient = clientAnswering({
            spaces: { data: null, error: null },
            space_collaborators: { data: null, error: null },
        });

        expect(await resolveSpacePermission(collaboratorClient, 'space-1', 'user-2')).toBe(
            'restricted',
        );
        expect(await resolveSpacePermission(strangerClient, 'space-1', 'user-3')).toBeNull();
    });

    it('throws instead of answering "no access" when the space read fails', async () => {
        const supabase = clientAnswering({ spaces: OUTAGE });

        await expect(resolveSpacePermission(supabase, 'space-1', 'user-1')).rejects.toThrow(
            SERVER_LOAD_FAILED,
        );
    });

    it('throws instead of answering "no access" when the collaborator read fails', async () => {
        const supabase = clientAnswering({
            spaces: { data: null, error: null },
            space_collaborators: OUTAGE,
        });

        await expect(resolveSpacePermission(supabase, 'space-1', 'user-1')).rejects.toThrow(
            SERVER_LOAD_FAILED,
        );
    });

    it('treats a malformedClient id as no access, not as an outage', async () => {
        const supabase = clientAnswering({
            spaces: MALFORMED_ID,
            space_collaborators: MALFORMED_ID,
        });

        expect(await resolveSpacePermission(supabase, 'not-a-uuid', 'user-1')).toBeNull();
    });

    it.each([
        ['list', getSpaceIdForList, 'lists', { space_id: 'space-1' }],
        ['sublist', getSpaceIdForSublist, 'sublists', { lists: { space_id: 'space-1' } }],
        ['task', getSpaceIdForTask, 'tasks', { lists: { space_id: 'space-1' } }],
    ])(
        'finds the space of a %s, null when missingClient, and throws on a failed read',
        async (_label, findSpaceId, tableName, tableRow) => {
            const foundClient = clientAnswering({ [tableName]: { data: tableRow, error: null } });
            const missingClient = clientAnswering({ [tableName]: { data: null, error: null } });
            const malformedClient = clientAnswering({ [tableName]: MALFORMED_ID });
            const failingClient = clientAnswering({ [tableName]: OUTAGE });

            expect(await findSpaceId(foundClient, 'id-1')).toBe('space-1');
            expect(await findSpaceId(missingClient, 'id-1')).toBeNull();
            expect(await findSpaceId(malformedClient, 'garbage')).toBeNull();
            await expect(findSpaceId(failingClient, 'id-1')).rejects.toThrow(SERVER_LOAD_FAILED);
        },
    );
});

describe('attachMyPermissionLevel', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    const spaces = [
        { id: 'space-own', owner_id: 'user-1' },
        { id: 'space-shared', owner_id: 'user-2' },
        { id: 'space-other', owner_id: 'user-3' },
    ];

    it('marks owned spaces, shared spaces and spaces with no access', async () => {
        const supabase = clientAnswering({
            space_collaborators: {
                data: [{ space_id: 'space-shared', permission_level: 'full' }],
                error: null,
            },
        });

        const annotatedSpaces = await attachMyPermissionLevel(supabase, spaces, 'user-1');

        expect(annotatedSpaces.map((space) => space.my_permission_level)).toEqual([
            'owner',
            'full',
            null,
        ]);
    });

    it('gives every space a null level without reading anything when signed out', async () => {
        const annotatedSpaces = await attachMyPermissionLevel(clientAnswering({}), spaces, null);

        expect(annotatedSpaces.every((space) => space.my_permission_level === null)).toBe(true);
    });

    it('throws instead of hiding edit controls when the collaborator read fails', async () => {
        const supabase = clientAnswering({ space_collaborators: OUTAGE });

        await expect(attachMyPermissionLevel(supabase, spaces, 'user-1')).rejects.toThrow(
            SERVER_LOAD_FAILED,
        );
    });
});
