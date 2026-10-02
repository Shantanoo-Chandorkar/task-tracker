import { beforeEach, describe, expect, it, vi } from 'vitest';

const CLIENT_ID = '3f2b1c4e-5d6a-4b7c-8d9e-0a1b2c3d4e5f';
const USER_ID = 'user-1';

const insertedRows = [];
let lookupRow = null;
let insertResult = null;

/**
 * Stand-in Supabase client: every filter call returns the same chain, `maybeSingle` answers the id lookup, and
 * `insert(...).select().single()` records the row and answers the configured insert result.
 */
function createFakeSupabase() {
    const chain = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: lookupRow }),
        single: async () => ({ data: { require_due_date: false, depth: 0 }, error: null }),
        insert: (row) => {
            insertedRows.push(row);
            return { select: () => ({ single: async () => insertResult }) };
        },
    };
    return { from: () => chain };
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => createFakeSupabase() }));
vi.mock('@/lib/auth/session', () => ({ getCurrentUser: async () => ({ id: USER_ID }) }));
vi.mock('@/lib/position', () => ({ getNextPosition: async () => 7 }));
vi.mock('@/lib/permissions/space-permissions', async (importOriginal) => ({
    ...(await importOriginal()),
    resolveSpacePermission: async () => 'owner',
    getSpaceIdForList: async () => 'space-1',
}));

const createActionCases = [
    {
        name: 'createSpace',
        module: './space-actions',
        ownerColumn: 'owner_id',
        fields: { name: 'Home' },
    },
    {
        name: 'createList',
        module: './list-actions',
        ownerColumn: 'created_by',
        fields: { name: 'Groceries', space_id: 'space-1' },
    },
    {
        name: 'createSublist',
        module: './sublist-actions',
        ownerColumn: 'created_by',
        fields: { name: 'Weekend', list_id: 'list-1' },
    },
    {
        name: 'createStatus',
        module: './status-actions',
        ownerColumn: 'created_by',
        fields: { name: 'Blocked', space_id: 'space-1' },
    },
    {
        name: 'createTask',
        module: './task-actions',
        ownerColumn: 'created_by',
        fields: { title: 'Buy milk', list_id: 'list-1' },
    },
];

describe.each(createActionCases)(
    '$name with a client-made id',
    ({ name, module, ownerColumn, fields }) => {
        beforeEach(() => {
            insertedRows.length = 0;
            lookupRow = null;
            insertResult = { data: { id: CLIENT_ID, [ownerColumn]: USER_ID }, error: null };
        });

        it('creates the row with that id', async () => {
            const createAction = (await import(module))[name];

            const { data, error } = await createAction({ ...fields, id: CLIENT_ID });

            expect(error).toBeNull();
            expect(data.id).toBe(CLIENT_ID);
            expect(insertedRows).toHaveLength(1);
            expect(insertedRows[0].id).toBe(CLIENT_ID);
        });

        it('returns the existing row on a retry and inserts nothing', async () => {
            lookupRow = { id: CLIENT_ID, [ownerColumn]: USER_ID, name: 'first try' };
            const createAction = (await import(module))[name];

            const { data, error } = await createAction({ ...fields, id: CLIENT_ID });

            expect(error).toBeNull();
            expect(data.name).toBe('first try');
            expect(insertedRows).toHaveLength(0);
        });

        it('does not hand back a row that belongs to someone else', async () => {
            lookupRow = { id: CLIENT_ID, [ownerColumn]: 'user-2', name: 'not yours' };
            insertResult = { data: null, error: { code: '23505' } };
            const createAction = (await import(module))[name];

            const { data, error } = await createAction({ ...fields, id: CLIENT_ID });

            expect(data).toBeNull();
            expect(error).toMatch(/Failed to create|Unexpected/);
        });

        it('rejects an id that is not a UUID with a stable code and writes nothing', async () => {
            const createAction = (await import(module))[name];

            const result = await createAction({ ...fields, id: 'not-a-uuid' });

            expect(result).toMatchObject({ data: null, code: 'INVALID_REQUEST_ID' });
            expect(insertedRows).toHaveLength(0);
        });

        it('still creates a row without an id, so other callers keep working', async () => {
            insertResult = { data: { id: 'server-made', [ownerColumn]: USER_ID }, error: null };
            const createAction = (await import(module))[name];

            const { data } = await createAction(fields);

            expect(data.id).toBe('server-made');
            expect(insertedRows[0]).not.toHaveProperty('id');
        });
    },
);
