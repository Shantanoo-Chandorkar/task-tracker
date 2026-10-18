import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from './test-support/fake-supabase';
import { buildTaskTables, COLLABORATOR_ID, OWNER_ID } from './test-support/task-fixtures';

let fake;
let currentUserId;

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fake.client }));
vi.mock('@/lib/auth/session', () => ({
    getCurrentUser: async () => currentUserId && { id: currentUserId },
}));

async function updateTaskWith(taskId, fields, { tablesOptions, fakeOptions } = {}) {
    fake = createFakeSupabase({
        tables: buildTaskTables(tablesOptions),
        getCallerId: () => currentUserId,
        ...fakeOptions,
    });
    const { updateTask } = await import('./task-update-actions');
    return updateTask(taskId, fields);
}

const taskUpdates = () => fake.updates.filter(({ tableName }) => tableName === 'tasks');

describe('updateTask checks', () => {
    beforeEach(() => {
        currentUserId = OWNER_ID;
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => vi.restoreAllMocks());

    it('refuses a signed-out caller with the stable auth code', async () => {
        currentUserId = null;

        const updateResult = await updateTaskWith('task-1', { title: 'New' });

        expect(updateResult).toMatchObject({ data: null, code: 'NOT_AUTHENTICATED' });
    });

    it('needs a task id', async () => {
        expect(await updateTaskWith('', { title: 'New' })).toEqual({
            data: null,
            error: 'Task ID is required',
        });
    });

    it('says so when the task does not exist', async () => {
        expect(await updateTaskWith('task-missing', { title: 'New' })).toEqual({
            data: null,
            error: 'Task not found',
        });
    });

    it('refuses a read-only collaborator', async () => {
        currentUserId = COLLABORATOR_ID;

        const updateResult = await updateTaskWith(
            'task-1',
            { title: 'New' },
            { tablesOptions: { collaboratorLevel: 'read_only' } },
        );

        expect(updateResult).toMatchObject({ data: null, code: 'PERMISSION_READ_ONLY' });
        expect(taskUpdates()).toHaveLength(0);
    });

    it("refuses a restricted collaborator on someone else's task but not on their own", async () => {
        currentUserId = COLLABORATOR_ID;
        const tablesOptions = {
            collaboratorLevel: 'restricted',
            extraTasks: [
                {
                    id: 'task-own',
                    list_id: 'list-1',
                    parent_id: null,
                    depth: 0,
                    position: 5,
                    created_by: COLLABORATOR_ID,
                },
            ],
        };

        const refused = await updateTaskWith('task-1', { title: 'New' }, { tablesOptions });
        const allowed = await updateTaskWith('task-own', { title: 'New' }, { tablesOptions });

        expect(refused).toMatchObject({ data: null, code: 'PERMISSION_RESTRICTED_NOT_OWN' });
        expect(allowed.error).toBeNull();
    });

    it('stops a due date being cleared when the space requires one', async () => {
        const updateResult = await updateTaskWith(
            'task-1',
            { due_date: null },
            { tablesOptions: { space: { require_due_date: true } } },
        );

        expect(updateResult).toMatchObject({ data: null, code: 'TASK_DUE_DATE_REQUIRED' });
        expect(taskUpdates()).toHaveLength(0);
    });

    it.each([
        ['an empty title', { title: ' <i></i> ' }, 'Title is required'],
        ['a title over 200 characters', { title: 'x'.repeat(201) }, /Title cannot exceed 200/],
        [
            'a description over 10000 characters',
            { description: 'x'.repeat(10001) },
            /Description cannot exceed 10000/,
        ],
    ])('rejects %s before writing', async (label, fields, expectedError) => {
        const updateResult = await updateTaskWith('task-1', fields);

        expect(updateResult.data).toBeNull();
        expect(updateResult.error).toMatch(expectedError);
        expect(taskUpdates()).toHaveLength(0);
    });

    it('rejects a priority that is not a real boolean', async () => {
        const updateResult = await updateTaskWith('task-1', { is_prioritised: 'yes' });

        expect(updateResult).toMatchObject({ data: null, code: 'TASK_INVALID_PRIORITY' });
    });

    it('blocks marking a task done while a subtask is not done', async () => {
        const updateResult = await updateTaskWith('task-1', { status_id: 'status-done' });

        expect(updateResult).toEqual({
            data: null,
            error: 'Complete all subtasks before marking this task done',
        });
        expect(taskUpdates()).toHaveLength(0);
    });

    it('allows marking a task done when it has no subtasks', async () => {
        const updateResult = await updateTaskWith('task-3', { status_id: 'status-done' });

        expect(updateResult.error).toBeNull();
        expect(taskUpdates()[0].values).toEqual({ status_id: 'status-done' });
    });

    it('refuses to put a subtask in a sublist directly', async () => {
        const updateResult = await updateTaskWith('task-2', { sublist_id: 'sublist-1' });

        expect(updateResult).toEqual({
            data: null,
            error: "A subtask can't belong to a sublist directly",
        });
    });

    it('refuses a sublist from another list', async () => {
        const updateResult = await updateTaskWith('task-1', { sublist_id: 'sublist-2' });

        expect(updateResult).toEqual({ data: null, error: 'Sublist does not belong to this list' });
    });

    it('turns a database failure into a generic message without the detail', async () => {
        const updateResult = await updateTaskWith(
            'task-1',
            { title: 'New' },
            { fakeOptions: { updateError: { code: 'XX000', message: 'secret table detail' } } },
        );

        expect(updateResult).toEqual({ data: null, error: 'Failed to update task' });
    });

    it('turns the database write limit into its stable code', async () => {
        const updateResult = await updateTaskWith(
            'task-1',
            { title: 'New' },
            {
                fakeOptions: {
                    updateError: { code: 'P0001', message: 'TASK_WRITE_RATE_LIMITED:hour' },
                },
            },
        );

        expect(updateResult).toMatchObject({ data: null, code: 'TASK_RATE_LIMITED' });
    });
});

describe('updateTask writes', () => {
    beforeEach(() => {
        currentUserId = OWNER_ID;
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => vi.restoreAllMocks());

    it('writes only the fields on the allowlist', async () => {
        await updateTaskWith('task-1', {
            title: 'New',
            created_by: 'someone-else',
            list_id: 'list-2',
            depth: 9,
        });

        expect(taskUpdates()[0].values).toEqual({ title: 'New' });
    });

    it('writes nothing for fields the caller left out', async () => {
        await updateTaskWith('task-1', { due_date: '2026-03-01' });

        expect(taskUpdates()[0].values).toEqual({ due_date: '2026-03-01' });
    });

    it('cleans the title and the description, and stores an empty description as null', async () => {
        await updateTaskWith('task-1', { title: '  <b>New</b> ', description: '' });

        expect(taskUpdates()[0].values).toEqual({ title: 'New', description: null });
    });

    it('clears the next occurrence when recurrence is switched off', async () => {
        await updateTaskWith('task-1', { is_recurring: false });

        expect(taskUpdates()[0].values).toEqual({ is_recurring: false, next_occurrence: null });
    });
});
