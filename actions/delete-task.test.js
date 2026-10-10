import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from './test-support/fake-supabase';
import { buildTaskTables, COLLABORATOR_ID, OWNER_ID } from './test-support/task-fixtures';

let fake;
let currentUserId;

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fake.client }));
vi.mock('@/lib/auth/session', () => ({
    getCurrentUser: async () => currentUserId && { id: currentUserId },
}));

async function runDelete(actionName, taskId, { tablesOptions, fakeOptions } = {}) {
    fake = createFakeSupabase({
        tables: buildTaskTables(tablesOptions),
        getCallerId: () => currentUserId,
        ...fakeOptions,
    });
    const actions = await import('./task-delete-actions');
    return actions[actionName](taskId);
}

beforeEach(() => {
    currentUserId = OWNER_ID;
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('deleteTask', () => {
    it('refuses a signed-out caller with the stable auth code', async () => {
        currentUserId = null;

        expect(await runDelete('deleteTask', 'task-3')).toMatchObject({
            code: 'NOT_AUTHENTICATED',
        });
        expect(fake.deletes).toHaveLength(0);
    });

    it('needs a task id', async () => {
        expect(await runDelete('deleteTask', '')).toEqual({ error: 'Task ID is required' });
    });

    it('says so when the task does not exist', async () => {
        expect(await runDelete('deleteTask', 'task-missing')).toEqual({ error: 'Task not found' });
        expect(fake.deletes).toHaveLength(0);
    });

    it('deletes the task for its owner', async () => {
        const deleteResult = await runDelete('deleteTask', 'task-3');

        expect(deleteResult).toEqual({ error: null });
        expect(fake.deletes).toHaveLength(1);
    });

    it('refuses a read-only collaborator', async () => {
        currentUserId = COLLABORATOR_ID;

        const deleteResult = await runDelete('deleteTask', 'task-3', {
            tablesOptions: { collaboratorLevel: 'read_only' },
        });

        expect(deleteResult).toMatchObject({ code: 'PERMISSION_READ_ONLY' });
        expect(fake.deletes).toHaveLength(0);
    });

    it("refuses a restricted collaborator on someone else's task", async () => {
        currentUserId = COLLABORATOR_ID;

        const deleteResult = await runDelete('deleteTask', 'task-3', {
            tablesOptions: { collaboratorLevel: 'restricted' },
        });

        expect(deleteResult).toMatchObject({ code: 'PERMISSION_RESTRICTED_NOT_OWN' });
    });

    it('turns the database write limit into its stable code', async () => {
        const deleteResult = await runDelete('deleteTask', 'task-3', {
            fakeOptions: {
                deleteError: { code: 'P0001', message: 'TASK_WRITE_RATE_LIMITED:hour' },
            },
        });

        expect(deleteResult).toMatchObject({ code: 'TASK_RATE_LIMITED' });
    });

    it('reports "not found" for any other delete error, without the detail', async () => {
        const deleteResult = await runDelete('deleteTask', 'task-3', {
            fakeOptions: { deleteError: { code: 'XX000', message: 'secret table detail' } },
        });

        expect(deleteResult).toEqual({ error: 'Task not found' });
    });
});

describe('deleteTaskAndReparentChildren', () => {
    it('refuses a signed-out caller with the stable auth code', async () => {
        currentUserId = null;

        expect(await runDelete('deleteTaskAndReparentChildren', 'task-2')).toMatchObject({
            code: 'NOT_AUTHENTICATED',
        });
    });

    it('needs a task id', async () => {
        expect(await runDelete('deleteTaskAndReparentChildren', '')).toEqual({
            error: 'Task ID is required',
        });
    });

    it('says so when the task does not exist', async () => {
        expect(await runDelete('deleteTaskAndReparentChildren', 'task-missing')).toEqual({
            error: 'Task not found',
        });
    });

    it('refuses a read-only collaborator before calling the database function', async () => {
        currentUserId = COLLABORATOR_ID;

        const deleteResult = await runDelete('deleteTaskAndReparentChildren', 'task-2', {
            tablesOptions: { collaboratorLevel: 'read_only' },
        });

        expect(deleteResult).toMatchObject({ code: 'PERMISSION_READ_ONLY' });
        expect(fake.rpcCalls).toHaveLength(0);
    });

    it('deletes and re-parents in one database call', async () => {
        const deleteResult = await runDelete('deleteTaskAndReparentChildren', 'task-2', {
            fakeOptions: { rpcResults: { delete_task_reparent_children: { error: null } } },
        });

        expect(deleteResult).toEqual({ error: null });
        expect(fake.rpcCalls).toEqual([
            { functionName: 'delete_task_reparent_children', args: { p_task_id: 'task-2' } },
        ]);
    });

    it.each([
        ['TASK_WRITE_RATE_LIMITED:minute', 'TASK_RATE_LIMITED'],
        ['TASK_NOT_FOUND', 'TASK_NOT_FOUND'],
        ['TASK_SUBTASK_CAP_REACHED', 'TASK_SUBTASK_CAP_REACHED'],
        ['TASK_REPARENT_FORBIDDEN_CHILDREN', 'TASK_REPARENT_FORBIDDEN_CHILDREN'],
        ['something unexpected inside the database', 'TASK_REPARENT_DELETE_FAILED'],
    ])('maps the database error "%s" to the code %s', async (databaseMessage, expectedCode) => {
        const deleteResult = await runDelete('deleteTaskAndReparentChildren', 'task-2', {
            fakeOptions: {
                rpcResults: {
                    delete_task_reparent_children: {
                        error: { code: 'P0001', message: databaseMessage },
                    },
                },
            },
        });

        expect(deleteResult.code).toBe(expectedCode);
        expect(JSON.stringify(deleteResult)).not.toContain('inside the database');
    });
});
