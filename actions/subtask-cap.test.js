import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from './test-support/fake-supabase';

const OWNER_ID = 'user-owner';

let fake;

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fake.client }));
vi.mock('@/lib/auth/session', () => ({ getCurrentUser: async () => ({ id: OWNER_ID }) }));

function buildTables() {
    return {
        spaces: [
            {
                id: 'space-1',
                owner_id: OWNER_ID,
                max_subtasks_per_parent: 1,
                require_due_date: false,
            },
        ],
        space_collaborators: [],
        lists: [{ id: 'list-1', space_id: 'space-1' }],
        sublists: [],
        tasks: [
            {
                id: 'task-parent',
                list_id: 'list-1',
                parent_id: null,
                sublist_id: null,
                depth: 0,
                position: 1,
                created_by: OWNER_ID,
            },
        ],
    };
}

describe('subtask cap check when creating a subtask', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('says the parent task was not found instead of skipping the check', async () => {
        fake = createFakeSupabase({ tables: buildTables(), getCallerId: () => OWNER_ID });
        const { createTask } = await import('./task-create-actions');

        const createResult = await createTask({
            title: 'Child',
            list_id: 'list-1',
            parent_id: 'task-that-does-not-exist',
        });

        expect(createResult).toMatchObject({
            data: null,
            error: 'Parent task not found',
            code: 'TASK_NOT_FOUND',
        });
    });

    it('still refuses a new subtask once the parent is at the cap', async () => {
        const tables = buildTables();
        tables.tasks.push({
            ...tables.tasks[0],
            id: 'task-child',
            parent_id: 'task-parent',
            depth: 1,
        });
        fake = createFakeSupabase({ tables, getCallerId: () => OWNER_ID });
        const { createTask } = await import('./task-create-actions');

        const createResult = await createTask({
            title: 'Second child',
            list_id: 'list-1',
            parent_id: 'task-parent',
        });

        expect(createResult.code).toBe('TASK_SUBTASK_CAP_REACHED');
    });
});
