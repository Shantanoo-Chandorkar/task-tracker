import { beforeEach, describe, expect, it, vi } from 'vitest';

const NEW_ROOT_ID = '3f2b1c4e-5d6a-4b7c-8d9e-0a1b2c3d4e5f';
const USER_ID = 'user-1';
const sourceTask = {
    id: 'task-1',
    list_id: 'list-1',
    parent_id: null,
    sublist_id: null,
    depth: 0,
    position: 1,
    lists: { space_id: 'space-1' },
};

const rpcCalls = [];
let lookupRow = null;
let rpcResult = { error: null };
let listReadError = null;

/**
 * Stand-in Supabase client. Awaiting a filter chain answers with the source task's list, `single` answers the
 * source task, `maybeSingle` answers the new-root lookup, and `rpc` records its arguments.
 */
function createFakeSupabase() {
    const chain = {
        select: () => chain,
        eq: () => chain,
        neq: () => chain,
        is: () => chain,
        order: () => chain,
        range: () => chain,
        single: async () => ({ data: sourceTask, error: null }),
        maybeSingle: async () => ({ data: lookupRow }),
        then: (resolve) =>
            resolve(listReadError ? { data: null, error: listReadError } : { data: [sourceTask] }),
    };
    return {
        from: () => chain,
        rpc: async (functionName, args) => {
            rpcCalls.push({ functionName, args });
            return rpcResult;
        },
    };
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => createFakeSupabase() }));
vi.mock('@/lib/auth/session', () => ({ getCurrentUser: async () => ({ id: USER_ID }) }));
vi.mock('@/lib/permissions/space-permissions', async (importOriginal) => ({
    ...(await importOriginal()),
    resolveSpacePermission: async () => 'owner',
}));

describe('duplicateTask with a client-made id for the copy', () => {
    beforeEach(() => {
        rpcCalls.length = 0;
        lookupRow = null;
        rpcResult = { error: null };
        listReadError = null;
    });

    it('fails cleanly and copies nothing when the list read for the depth check fails', async () => {
        listReadError = { code: '57014', message: 'timeout detail' };
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const { duplicateTask } = await import('./task-duplicate-action');

        const duplicateResult = await duplicateTask('task-1', NEW_ROOT_ID);

        expect(duplicateResult).toEqual({ error: 'Failed to duplicate task' });
        expect(rpcCalls).toHaveLength(0);
    });

    it('passes the id to the database function so the copy gets that id', async () => {
        const { duplicateTask } = await import('./task-duplicate-action');

        const { error } = await duplicateTask('task-1', NEW_ROOT_ID);

        expect(error).toBeNull();
        expect(rpcCalls).toHaveLength(1);
        expect(rpcCalls[0].args).toMatchObject({ p_task_id: 'task-1', p_new_root_id: NEW_ROOT_ID });
    });

    it('reports success on a retry and copies nothing when the copy already exists', async () => {
        lookupRow = { id: NEW_ROOT_ID, created_by: USER_ID };
        const { duplicateTask } = await import('./task-duplicate-action');

        const { error } = await duplicateTask('task-1', NEW_ROOT_ID);

        expect(error).toBeNull();
        expect(rpcCalls).toHaveLength(0);
    });

    it("does not treat someone else's row with that id as a finished copy", async () => {
        lookupRow = { id: NEW_ROOT_ID, created_by: 'user-2' };
        rpcResult = { error: { code: '23505', message: 'duplicate key' } };
        const { duplicateTask } = await import('./task-duplicate-action');

        const { error } = await duplicateTask('task-1', NEW_ROOT_ID);

        expect(error).toBeTruthy();
    });

    it("treats a key clash from a simultaneous request as success when the copy is the caller's own", async () => {
        rpcResult = { error: { code: '23505', message: 'duplicate key' } };
        const { duplicateTask } = await import('./task-duplicate-action');
        lookupRow = null;

        const firstAttempt = await duplicateTask('task-1', NEW_ROOT_ID);
        expect(firstAttempt.error).toBeTruthy();

        lookupRow = { id: NEW_ROOT_ID, created_by: USER_ID };
        const raceAttempt = await duplicateTask('task-1', NEW_ROOT_ID);
        expect(raceAttempt.error).toBeNull();
    });

    it('rejects an id that is not a UUID with a stable code and copies nothing', async () => {
        const { duplicateTask } = await import('./task-duplicate-action');

        const result = await duplicateTask('task-1', 'not-a-uuid');

        expect(result).toMatchObject({ code: 'INVALID_REQUEST_ID' });
        expect(rpcCalls).toHaveLength(0);
    });

    it('still duplicates without an id, so the menu and other callers keep working', async () => {
        const { duplicateTask } = await import('./task-duplicate-action');

        const { error } = await duplicateTask('task-1');

        expect(error).toBeNull();
        expect(rpcCalls[0].args).not.toHaveProperty('p_new_root_id');
    });
});
