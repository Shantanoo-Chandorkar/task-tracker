import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from './test-support/fake-supabase';
import { buildTaskTables, COLLABORATOR_ID, OWNER_ID } from './test-support/task-fixtures';

const LOADED_STAMP = '2030-01-01T10:00:00.123456+00:00';
const NEWER_STAMP = '2030-01-01T10:05:00.654321+00:00';

let fake;
let tables;
let currentUserId;

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fake.client }));
vi.mock('@/lib/auth/session', () => ({
    getCurrentUser: async () => currentUserId && { id: currentUserId },
}));

function setUpWorld(tablesOptions) {
    tables = buildTaskTables(tablesOptions);
    for (const task of tables.tasks) {
        task.title = `Title of ${task.id}`;
        task.updated_at = LOADED_STAMP;
    }
    fake = createFakeSupabase({ tables, getCallerId: () => currentUserId });
}

/** Changes the stored task just before the update runs, as another person's save landing in between would. */
function changeTaskJustBeforeUpdate(changeTask) {
    const realClient = fake.client;
    fake.client = {
        ...realClient,
        from: (tableName) => {
            const builder = realClient.from(tableName);
            if (tableName === 'tasks') {
                const realUpdate = builder.update;
                builder.update = (values) => {
                    changeTask(tables.tasks);
                    return realUpdate(values);
                };
            }
            return builder;
        },
    };
}

async function updateTaskWith(taskId, fields, options) {
    const { updateTask } = await import('./task-update-actions');
    return updateTask(taskId, fields, options);
}

const storedTask = (taskId) => tables.tasks.find((task) => task.id === taskId);

describe('updateTask edit conflicts', () => {
    beforeEach(() => {
        currentUserId = OWNER_ID;
        setUpWorld();
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => vi.restoreAllMocks());

    it('overwrites regardless when the caller sends no version, as before', async () => {
        storedTask('task-1').updated_at = NEWER_STAMP;

        const updateResult = await updateTaskWith('task-1', { title: 'Mine' });

        expect(updateResult).toMatchObject({ error: null, data: { title: 'Mine' } });
    });

    it('treats a null version like no version', async () => {
        const updateResult = await updateTaskWith(
            'task-1',
            { title: 'Mine' },
            { expectedUpdatedAt: null },
        );

        expect(updateResult).toMatchObject({ error: null, data: { title: 'Mine' } });
    });

    it('saves when the task is still at the version the caller loaded', async () => {
        const updateResult = await updateTaskWith(
            'task-1',
            { title: 'Mine' },
            { expectedUpdatedAt: LOADED_STAMP },
        );

        expect(updateResult).toMatchObject({ error: null, data: { id: 'task-1', title: 'Mine' } });
        expect(storedTask('task-1').title).toBe('Mine');
    });

    it('refuses with the conflict code, writes nothing, and hands back the stored task', async () => {
        storedTask('task-1').updated_at = NEWER_STAMP;
        storedTask('task-1').title = 'Theirs';

        const updateResult = await updateTaskWith(
            'task-1',
            { title: 'Mine' },
            { expectedUpdatedAt: LOADED_STAMP },
        );

        expect(updateResult).toMatchObject({
            data: null,
            code: 'TASK_EDIT_CONFLICT',
            currentTask: { id: 'task-1', title: 'Theirs', updated_at: NEWER_STAMP },
        });
        expect(updateResult.error).toContain('changed');
        expect(storedTask('task-1').title).toBe('Theirs');
    });

    it('catches a save that lands between the read and the write', async () => {
        changeTaskJustBeforeUpdate((storedTasks) => {
            const task = storedTasks.find((candidate) => candidate.id === 'task-1');
            task.updated_at = NEWER_STAMP;
            task.title = 'Theirs';
        });

        const updateResult = await updateTaskWith(
            'task-1',
            { title: 'Mine' },
            { expectedUpdatedAt: LOADED_STAMP },
        );

        expect(updateResult).toMatchObject({ data: null, code: 'TASK_EDIT_CONFLICT' });
        expect(storedTask('task-1').title).toBe('Theirs');
    });

    it('says the task is gone when it was deleted between the read and the write', async () => {
        changeTaskJustBeforeUpdate((storedTasks) => {
            storedTasks.splice(
                storedTasks.findIndex((candidate) => candidate.id === 'task-3'),
                1,
            );
        });

        const updateResult = await updateTaskWith(
            'task-3',
            { title: 'Mine' },
            { expectedUpdatedAt: LOADED_STAMP },
        );

        expect(updateResult).toEqual({ data: null, error: 'Task not found' });
    });

    it.each(['yesterday-ish', 42, {}, ''])(
        'refuses the version %j with the invalid-version code and writes nothing',
        async (expectedUpdatedAt) => {
            const updateResult = await updateTaskWith(
                'task-1',
                { title: 'Mine' },
                { expectedUpdatedAt },
            );

            expect(updateResult).toMatchObject({ data: null, code: 'TASK_VERSION_INVALID' });
            expect(storedTask('task-1').title).toBe('Title of task-1');
            expect(fake.updates).toHaveLength(0);
        },
    );

    it('checks write permission first, so a read-only collaborator learns nothing about the task', async () => {
        setUpWorld({ collaboratorLevel: 'read_only' });
        currentUserId = COLLABORATOR_ID;
        storedTask('task-1').updated_at = NEWER_STAMP;

        const updateResult = await updateTaskWith(
            'task-1',
            { title: 'Mine' },
            { expectedUpdatedAt: LOADED_STAMP },
        );

        expect(updateResult).toMatchObject({ data: null, code: 'PERMISSION_READ_ONLY' });
        expect(updateResult).not.toHaveProperty('currentTask');
    });

    it('gives a stranger no task row either', async () => {
        currentUserId = 'user-stranger';
        storedTask('task-1').updated_at = NEWER_STAMP;

        const updateResult = await updateTaskWith(
            'task-1',
            { title: 'Mine' },
            { expectedUpdatedAt: LOADED_STAMP },
        );

        expect(updateResult).toMatchObject({ data: null, code: 'PERMISSION_NOT_A_MEMBER' });
        expect(updateResult).not.toHaveProperty('currentTask');
    });

    it('does not let a field named updated_at change the stored version', async () => {
        await updateTaskWith(
            'task-1',
            { title: 'Mine', updated_at: '1999-01-01T00:00:00Z' },
            { expectedUpdatedAt: LOADED_STAMP },
        );

        expect(storedTask('task-1').updated_at).toBe(LOADED_STAMP);
    });
});
