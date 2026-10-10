import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from './test-support/fake-supabase';
import { buildTaskTables, COLLABORATOR_ID, OWNER_ID } from './test-support/task-fixtures';

let fake;
let currentUserId;
let startingStatusId;

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fake.client }));
vi.mock('@/lib/auth/session', () => ({
    getCurrentUser: async () => currentUserId && { id: currentUserId },
}));

async function runCascade(actionName, taskId, { tablesOptions, fakeOptions, mutateTables } = {}) {
    const tables = buildTaskTables(tablesOptions);
    tables.tasks.forEach((task) => (task.status_id = startingStatusId));
    mutateTables?.(tables);
    fake = createFakeSupabase({ tables, getCallerId: () => currentUserId, ...fakeOptions });
    const actions = await import('./task-completion-actions');
    return actions[actionName](taskId);
}

const taskUpdates = () => fake.updates.filter(({ tableName }) => tableName === 'tasks');

beforeEach(() => {
    currentUserId = OWNER_ID;
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe.each([
    {
        actionName: 'completeTaskAndDescendants',
        startingStatusId: 'status-todo',
        writtenStatusId: 'status-done',
        missingStatusError: 'No "done" status configured',
        failureError: 'Failed to mark tasks complete',
        dropStatusRow: (tables) => {
            tables.statuses = tables.statuses.filter((status) => status.code !== 'done');
        },
    },
    {
        actionName: 'uncompleteTaskAndDescendants',
        startingStatusId: 'status-done',
        writtenStatusId: 'status-todo',
        missingStatusError: 'No default status configured',
        failureError: 'Failed to mark tasks incomplete',
        dropStatusRow: (tables) => {
            tables.statuses = tables.statuses.filter((status) => !status.is_default);
        },
    },
])(
    '$actionName',
    ({
        actionName,
        startingStatusId: statusBeforeCascade,
        writtenStatusId,
        missingStatusError,
        failureError,
        dropStatusRow,
    }) => {
        beforeEach(() => {
            startingStatusId = statusBeforeCascade;
        });

        it('refuses a signed-out caller with the stable auth code', async () => {
            currentUserId = null;

            expect(await runCascade(actionName, 'task-1')).toMatchObject({
                code: 'NOT_AUTHENTICATED',
            });
        });

        it('needs a task id', async () => {
            expect(await runCascade(actionName, '')).toEqual({ error: 'Task ID is required' });
        });

        it('says so when the task does not exist', async () => {
            expect(await runCascade(actionName, 'task-missing')).toEqual({
                error: 'Task not found',
            });
        });

        it('refuses a read-only collaborator', async () => {
            currentUserId = COLLABORATOR_ID;

            const cascadeResult = await runCascade(actionName, 'task-1', {
                tablesOptions: { collaboratorLevel: 'read_only' },
            });

            expect(cascadeResult).toMatchObject({ code: 'PERMISSION_READ_ONLY' });
            expect(taskUpdates()).toHaveLength(0);
        });

        it('says so when the space has no status to write', async () => {
            const cascadeResult = await runCascade(actionName, 'task-1', {
                mutateTables: dropStatusRow,
            });

            expect(cascadeResult).toEqual({ error: missingStatusError });
            expect(taskUpdates()).toHaveLength(0);
        });

        it('sets the status on the task and every descendant in one update', async () => {
            const cascadeResult = await runCascade(actionName, 'task-1');

            expect(cascadeResult).toEqual({ error: null });
            expect(taskUpdates()).toHaveLength(1);
            expect(taskUpdates()[0].values).toEqual({ status_id: writtenStatusId });
            expect(
                fake.queries.some(({ filters }) =>
                    filters.some(({ operator }) => operator === 'in'),
                ),
            ).toBe(true);
        });

        it('leaves tasks outside the subtree alone', async () => {
            const tables = buildTaskTables({
                extraTasks: [
                    {
                        id: 'task-other',
                        list_id: 'list-1',
                        parent_id: null,
                        depth: 0,
                        position: 9,
                        created_by: OWNER_ID,
                        status_id: 'status-unrelated',
                    },
                ],
            });
            tables.tasks.forEach((task) => {
                if (task.id !== 'task-other') task.status_id = statusBeforeCascade;
            });
            fake = createFakeSupabase({ tables, getCallerId: () => OWNER_ID });
            const actions = await import('./task-completion-actions');

            await actions[actionName]('task-2');

            const statusById = Object.fromEntries(
                tables.tasks.map((task) => [task.id, task.status_id]),
            );
            expect(statusById['task-other']).toBe('status-unrelated');
            expect(statusById['task-2']).toBe(writtenStatusId);
            expect(statusById['task-3']).toBe(writtenStatusId);
        });

        it('turns the database write limit into its stable code', async () => {
            const cascadeResult = await runCascade(actionName, 'task-1', {
                fakeOptions: {
                    updateError: { code: 'P0001', message: 'TASK_WRITE_RATE_LIMITED:minute' },
                },
            });

            expect(cascadeResult).toMatchObject({ code: 'TASK_RATE_LIMITED' });
        });

        it('turns any other database failure into a generic message without the detail', async () => {
            const cascadeResult = await runCascade(actionName, 'task-1', {
                fakeOptions: { updateError: { code: 'XX000', message: 'secret table detail' } },
            });

            expect(cascadeResult).toEqual({ error: failureError });
        });
    },
);
