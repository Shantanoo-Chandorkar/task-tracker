import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from './test-support/fake-supabase';

const OWNER_ID = 'user-owner';
const COLLABORATOR_ID = 'user-collab';
const STRANGER_ID = 'user-stranger';

const SPACE_1 = '10000000-0000-4000-8000-000000000001';
const SPACE_2 = '10000000-0000-4000-8000-000000000002';
const SPACE_3 = '10000000-0000-4000-8000-000000000003';
const OTHER_OWNERS_SPACE = '10000000-0000-4000-8000-000000000009';
const LIST_1 = '20000000-0000-4000-8000-000000000001';
const LIST_2 = '20000000-0000-4000-8000-000000000002';
const LIST_3 = '20000000-0000-4000-8000-000000000003';
const LIST_OF_SPACE_2 = '20000000-0000-4000-8000-000000000004';
const SUBLIST_1 = '30000000-0000-4000-8000-000000000001';
const SUBLIST_2 = '30000000-0000-4000-8000-000000000002';
const STATUS_1 = '40000000-0000-4000-8000-000000000001';
const STATUS_2 = '40000000-0000-4000-8000-000000000002';
const TAG_1 = '50000000-0000-4000-8000-000000000001';
const TAG_2 = '50000000-0000-4000-8000-000000000002';
const TAG_3 = '50000000-0000-4000-8000-000000000003';
const MISSING_ID = '99999999-9999-4999-8999-999999999999';

let fake;
let tables;
let currentUserId;

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fake.client }));
vi.mock('@/lib/auth/session', () => ({
    getCurrentUser: async () => currentUserId && { id: currentUserId },
}));

function buildTables(collaboratorLevel = null) {
    return {
        spaces: [
            { id: SPACE_1, owner_id: OWNER_ID, position: 0 },
            { id: SPACE_2, owner_id: OWNER_ID, position: 1 },
            { id: SPACE_3, owner_id: OWNER_ID, position: 2 },
            { id: OTHER_OWNERS_SPACE, owner_id: STRANGER_ID, position: 0 },
        ],
        space_collaborators: collaboratorLevel
            ? [
                  {
                      space_id: SPACE_1,
                      user_id: COLLABORATOR_ID,
                      status: 'accepted',
                      permission_level: collaboratorLevel,
                  },
              ]
            : [],
        lists: [
            { id: LIST_1, space_id: SPACE_1, created_by: OWNER_ID, position: 0 },
            { id: LIST_2, space_id: SPACE_1, created_by: COLLABORATOR_ID, position: 1 },
            { id: LIST_3, space_id: SPACE_1, created_by: COLLABORATOR_ID, position: 2 },
            { id: LIST_OF_SPACE_2, space_id: SPACE_2, created_by: OWNER_ID, position: 0 },
        ],
        sublists: [
            { id: SUBLIST_1, list_id: LIST_1, created_by: OWNER_ID, position: 0 },
            { id: SUBLIST_2, list_id: LIST_1, created_by: OWNER_ID, position: 1 },
        ],
        statuses: [
            { id: STATUS_1, space_id: SPACE_1, created_by: OWNER_ID, position: 0 },
            { id: STATUS_2, space_id: SPACE_1, created_by: OWNER_ID, position: 1 },
        ],
        tags: [
            { id: TAG_1, space_id: SPACE_1, created_by: OWNER_ID, position: 0 },
            { id: TAG_2, space_id: SPACE_1, created_by: COLLABORATOR_ID, position: 1 },
            { id: TAG_3, space_id: SPACE_2, created_by: OWNER_ID, position: 0 },
        ],
    };
}

async function runAction(actionName, ...args) {
    const actions = await import('./reorder-actions');
    return actions[actionName](...args);
}

function positionsOf(tableName) {
    return Object.fromEntries(tables[tableName].map((row) => [row.id, row.position]));
}

beforeEach(() => {
    currentUserId = OWNER_ID;
    tables = buildTables();
    fake = createFakeSupabase({ tables, getCallerId: () => currentUserId });
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('reorder actions: who may call and what they may send', () => {
    it('refuses a signed-out caller with the stable auth code and writes nothing', async () => {
        currentUserId = null;

        expect(await runAction('reorderSpaces', [SPACE_2, SPACE_1, SPACE_3])).toEqual({
            error: 'You must be logged in',
            code: 'NOT_AUTHENTICATED',
        });
        expect(fake.updates).toHaveLength(0);
    });

    it.each([
        ['an id list that is not a list', 'abc'],
        ['an empty list', []],
        ['an id that is not a uuid', [SPACE_1, 'space-2']],
        ['the same id twice', [SPACE_1, SPACE_1]],
    ])(
        'refuses %s with the invalid-request code and writes nothing',
        async (_reason, orderedIds) => {
            expect(await runAction('reorderSpaces', orderedIds)).toEqual({
                error: 'The new order is not valid',
                code: 'REORDER_INVALID_REQUEST',
            });
            expect(fake.updates).toHaveLength(0);
        },
    );

    it('refuses a parent id that is not a uuid', async () => {
        expect(await runAction('reorderLists', 'space-1', [LIST_1])).toMatchObject({
            code: 'REORDER_INVALID_REQUEST',
        });
        expect(await runAction('reorderSublists', 'list-1', [SUBLIST_1])).toMatchObject({
            code: 'REORDER_INVALID_REQUEST',
        });
    });

    it('answers a failed read with a generic message that leaks nothing', async () => {
        fake.client = {
            ...fake.client,
            from: () => ({
                select: () => ({
                    in: () => ({
                        eq: async () => ({
                            data: null,
                            error: { code: 'XX000', message: 'secret table detail' },
                        }),
                    }),
                }),
            }),
        };

        const reorderResult = await runAction('reorderSpaces', [SPACE_2, SPACE_1, SPACE_3]);

        expect(reorderResult).toEqual({ error: 'Unexpected error saving the order' });
        expect(JSON.stringify(reorderResult)).not.toContain('secret');
    });
});

describe('reorderSpaces', () => {
    it('saves the new order and writes only the spaces that moved', async () => {
        const reorderResult = await runAction('reorderSpaces', [SPACE_1, SPACE_3, SPACE_2]);

        expect(reorderResult).toEqual({ error: null });
        expect(positionsOf('spaces')).toMatchObject({ [SPACE_1]: 0, [SPACE_3]: 1, [SPACE_2]: 2 });
        expect(fake.updates).toHaveLength(2);
        expect(
            fake.updates.every((update) => Object.keys(update.values).join() === 'position'),
        ).toBe(true);
    });

    it('writes nothing when the order did not change', async () => {
        expect(await runAction('reorderSpaces', [SPACE_1, SPACE_2, SPACE_3])).toEqual({
            error: null,
        });
        expect(fake.updates).toHaveLength(0);
    });

    it('refuses a space the caller does not own and writes nothing', async () => {
        const reorderResult = await runAction('reorderSpaces', [OTHER_OWNERS_SPACE, SPACE_1]);

        expect(reorderResult).toMatchObject({ code: 'REORDER_ROWS_NOT_FOUND' });
        expect(fake.updates).toHaveLength(0);
        expect(positionsOf('spaces')[OTHER_OWNERS_SPACE]).toBe(0);
    });

    it('refuses a space that does not exist', async () => {
        expect(await runAction('reorderSpaces', [SPACE_1, MISSING_ID])).toMatchObject({
            code: 'REORDER_ROWS_NOT_FOUND',
        });
    });

    it('does not let a collaborator reorder the owner spaces', async () => {
        currentUserId = COLLABORATOR_ID;
        tables = buildTables('full');
        fake = createFakeSupabase({ tables, getCallerId: () => currentUserId });

        expect(await runAction('reorderSpaces', [SPACE_2, SPACE_1])).toMatchObject({
            code: 'REORDER_ROWS_NOT_FOUND',
        });
        expect(fake.updates).toHaveLength(0);
    });
});

describe('reorderLists', () => {
    it('saves the new order for the owner', async () => {
        const reorderResult = await runAction('reorderLists', SPACE_1, [LIST_3, LIST_1, LIST_2]);

        expect(reorderResult).toEqual({ error: null });
        expect(positionsOf('lists')).toMatchObject({ [LIST_3]: 0, [LIST_1]: 1, [LIST_2]: 2 });
    });

    it('never touches a list of another space', async () => {
        await runAction('reorderLists', SPACE_1, [LIST_3, LIST_1, LIST_2]);

        expect(positionsOf('lists')[LIST_OF_SPACE_2]).toBe(0);
    });

    it('refuses a list that belongs to another space and writes nothing', async () => {
        const reorderResult = await runAction('reorderLists', SPACE_1, [LIST_OF_SPACE_2, LIST_1]);

        expect(reorderResult).toMatchObject({ code: 'REORDER_ROWS_NOT_FOUND' });
        expect(fake.updates).toHaveLength(0);
    });

    it('refuses a list that does not exist and writes nothing', async () => {
        expect(await runAction('reorderLists', SPACE_1, [LIST_1, MISSING_ID])).toMatchObject({
            code: 'REORDER_ROWS_NOT_FOUND',
        });
        expect(fake.updates).toHaveLength(0);
    });

    it('lets a full collaborator reorder every list', async () => {
        currentUserId = COLLABORATOR_ID;
        tables = buildTables('full');
        fake = createFakeSupabase({ tables, getCallerId: () => currentUserId });

        expect(await runAction('reorderLists', SPACE_1, [LIST_2, LIST_1, LIST_3])).toEqual({
            error: null,
        });
    });

    it('refuses a restricted collaborator whole when one list is not theirs, and writes nothing', async () => {
        currentUserId = COLLABORATOR_ID;
        tables = buildTables('restricted');
        fake = createFakeSupabase({ tables, getCallerId: () => currentUserId });

        const reorderResult = await runAction('reorderLists', SPACE_1, [LIST_2, LIST_1, LIST_3]);

        expect(reorderResult).toMatchObject({ code: 'PERMISSION_RESTRICTED_NOT_OWN' });
        expect(fake.updates).toHaveLength(0);
    });

    it('lets a restricted collaborator reorder lists they made themselves', async () => {
        currentUserId = COLLABORATOR_ID;
        tables = buildTables('restricted');
        fake = createFakeSupabase({ tables, getCallerId: () => currentUserId });

        expect(await runAction('reorderLists', SPACE_1, [LIST_3, LIST_2])).toEqual({ error: null });
        expect(positionsOf('lists')).toMatchObject({ [LIST_3]: 0, [LIST_2]: 1 });
    });

    it('refuses a read-only collaborator and writes nothing', async () => {
        currentUserId = COLLABORATOR_ID;
        tables = buildTables('read_only');
        fake = createFakeSupabase({ tables, getCallerId: () => currentUserId });

        expect(await runAction('reorderLists', SPACE_1, [LIST_2, LIST_1])).toMatchObject({
            code: 'PERMISSION_READ_ONLY',
        });
        expect(fake.updates).toHaveLength(0);
    });

    it('refuses someone with no access to the space and writes nothing', async () => {
        currentUserId = STRANGER_ID;

        expect(await runAction('reorderLists', SPACE_1, [LIST_2, LIST_1])).toMatchObject({
            code: 'PERMISSION_NOT_A_MEMBER',
        });
        expect(fake.updates).toHaveLength(0);
    });

    it('checks access before looking at the rows, so a stranger learns nothing about which ids exist', async () => {
        currentUserId = STRANGER_ID;

        expect(await runAction('reorderLists', SPACE_1, [MISSING_ID])).toMatchObject({
            code: 'PERMISSION_NOT_A_MEMBER',
        });
        expect(fake.queries.some((query) => query.tableName === 'lists')).toBe(false);
    });

    it('reports a failed write with a generic message and a stable code', async () => {
        fake = createFakeSupabase({
            tables,
            getCallerId: () => currentUserId,
            updateError: { code: '42501', message: 'row level security detail' },
        });

        const reorderResult = await runAction('reorderLists', SPACE_1, [LIST_2, LIST_1, LIST_3]);

        expect(reorderResult).toEqual({
            error: 'Failed to save the new order',
            code: 'REORDER_SAVE_FAILED',
        });
        expect(console.error).toHaveBeenCalledWith(
            '[reorder] update failed',
            expect.objectContaining({ table: 'lists' }),
        );
    });

    it('counts an update that changed no row, which is how RLS blocks one, as a failure', async () => {
        const realClient = fake.client;
        fake.client = {
            ...realClient,
            from: (tableName) => {
                const builder = realClient.from(tableName);
                builder.update = () => ({
                    eq: () => ({ select: async () => ({ data: [], error: null }) }),
                });
                return builder;
            },
        };

        expect(await runAction('reorderLists', SPACE_1, [LIST_2, LIST_1, LIST_3])).toMatchObject({
            code: 'REORDER_SAVE_FAILED',
        });
    });
});

describe('reorderSublists', () => {
    it('saves the new order for the owner', async () => {
        expect(await runAction('reorderSublists', LIST_1, [SUBLIST_2, SUBLIST_1])).toEqual({
            error: null,
        });
        expect(positionsOf('sublists')).toMatchObject({ [SUBLIST_2]: 0, [SUBLIST_1]: 1 });
    });

    it('says the items are gone when the list does not exist', async () => {
        expect(await runAction('reorderSublists', MISSING_ID, [SUBLIST_1])).toMatchObject({
            code: 'REORDER_ROWS_NOT_FOUND',
        });
    });

    it('refuses a read-only collaborator through the list space', async () => {
        currentUserId = COLLABORATOR_ID;
        tables = buildTables('read_only');
        fake = createFakeSupabase({ tables, getCallerId: () => currentUserId });

        expect(await runAction('reorderSublists', LIST_1, [SUBLIST_2, SUBLIST_1])).toMatchObject({
            code: 'PERMISSION_READ_ONLY',
        });
        expect(fake.updates).toHaveLength(0);
    });
});

describe('reorderStatuses', () => {
    it('saves the new order for the owner', async () => {
        expect(await runAction('reorderStatuses', SPACE_1, [STATUS_2, STATUS_1])).toEqual({
            error: null,
        });
        expect(positionsOf('statuses')).toMatchObject({ [STATUS_2]: 0, [STATUS_1]: 1 });
    });

    it('refuses a status that is not in that space and writes nothing', async () => {
        tables.statuses.push({
            id: '40000000-0000-4000-8000-000000000003',
            space_id: SPACE_2,
            created_by: OWNER_ID,
            position: 0,
        });

        const reorderResult = await runAction('reorderStatuses', SPACE_1, [
            '40000000-0000-4000-8000-000000000003',
            STATUS_1,
        ]);

        expect(reorderResult).toMatchObject({ code: 'REORDER_ROWS_NOT_FOUND' });
        expect(fake.updates).toHaveLength(0);
    });

    it('refuses a read-only collaborator', async () => {
        currentUserId = COLLABORATOR_ID;
        tables = buildTables('read_only');
        fake = createFakeSupabase({ tables, getCallerId: () => currentUserId });

        expect(await runAction('reorderStatuses', SPACE_1, [STATUS_2, STATUS_1])).toMatchObject({
            code: 'PERMISSION_READ_ONLY',
        });
    });
});

describe('reorderTags', () => {
    it('saves the new order for the owner', async () => {
        expect(await runAction('reorderTags', SPACE_1, [TAG_2, TAG_1])).toEqual({ error: null });
        expect(positionsOf('tags')).toMatchObject({ [TAG_2]: 0, [TAG_1]: 1, [TAG_3]: 0 });
    });

    it('refuses a tag that is in another space and writes nothing', async () => {
        const reorderResult = await runAction('reorderTags', SPACE_1, [TAG_3, TAG_1]);

        expect(reorderResult).toMatchObject({ code: 'REORDER_ROWS_NOT_FOUND' });
        expect(fake.updates).toHaveLength(0);
    });

    it('refuses a restricted collaborator who tries to move a tag they did not make', async () => {
        currentUserId = COLLABORATOR_ID;
        tables = buildTables('restricted');
        fake = createFakeSupabase({ tables, getCallerId: () => currentUserId });

        expect(await runAction('reorderTags', SPACE_1, [TAG_2, TAG_1])).toMatchObject({
            code: 'PERMISSION_RESTRICTED_NOT_OWN',
        });
        expect(fake.updates).toHaveLength(0);
    });

    it('refuses a read-only collaborator and a stranger', async () => {
        currentUserId = COLLABORATOR_ID;
        tables = buildTables('read_only');
        fake = createFakeSupabase({ tables, getCallerId: () => currentUserId });
        expect(await runAction('reorderTags', SPACE_1, [TAG_2, TAG_1])).toMatchObject({
            code: 'PERMISSION_READ_ONLY',
        });

        currentUserId = STRANGER_ID;
        expect(await runAction('reorderTags', SPACE_1, [TAG_2, TAG_1])).toMatchObject({
            code: 'PERMISSION_NOT_A_MEMBER',
        });
    });
});
