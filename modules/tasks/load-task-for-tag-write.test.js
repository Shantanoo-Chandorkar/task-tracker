import { describe, expect, it } from 'vitest';
import { createFakeSupabase } from '@/modules/tasks/actions/test-support/fake-supabase';
import {
    buildTaskTables,
    COLLABORATOR_ID,
    OWNER_ID,
} from '@/modules/tasks/actions/test-support/task-fixtures';
import { loadTaskForTagWrite } from './load-task-for-tag-write';

function clientFor(callerId, tablesOptions) {
    return createFakeSupabase({
        tables: buildTaskTables(tablesOptions),
        getCallerId: () => callerId,
    }).client;
}

describe('loadTaskForTagWrite', () => {
    it('lets the owner tag their own task and returns its space id', async () => {
        const supabase = clientFor(OWNER_ID);

        const result = await loadTaskForTagWrite(supabase, { id: OWNER_ID }, 'task-1');

        expect(result).toEqual({ spaceId: 'space-1', failure: null });
    });

    it('lets a full collaborator tag a task they did not create', async () => {
        const supabase = clientFor(COLLABORATOR_ID, { collaboratorLevel: 'full' });

        const result = await loadTaskForTagWrite(supabase, { id: COLLABORATOR_ID }, 'task-1');

        expect(result).toEqual({ spaceId: 'space-1', failure: null });
    });

    it('lets a restricted collaborator tag a task they created themselves', async () => {
        const supabase = clientFor(COLLABORATOR_ID, {
            collaboratorLevel: 'restricted',
            extraTasks: [
                {
                    id: 'task-own',
                    list_id: 'list-1',
                    sublist_id: null,
                    created_by: COLLABORATOR_ID,
                    status_id: 'status-todo',
                    parent_id: null,
                    depth: 0,
                    position: 2,
                },
            ],
        });

        const result = await loadTaskForTagWrite(supabase, { id: COLLABORATOR_ID }, 'task-own');

        expect(result).toEqual({ spaceId: 'space-1', failure: null });
    });

    it('refuses a restricted collaborator tagging a task someone else created', async () => {
        const supabase = clientFor(COLLABORATOR_ID, { collaboratorLevel: 'restricted' });

        const result = await loadTaskForTagWrite(supabase, { id: COLLABORATOR_ID }, 'task-1');

        expect(result.spaceId).toBeNull();
        expect(result.failure?.code).toBe('PERMISSION_RESTRICTED_NOT_OWN');
    });

    it('refuses a read-only collaborator even for a task that is not theirs to begin with', async () => {
        const supabase = clientFor(COLLABORATOR_ID, { collaboratorLevel: 'read_only' });

        const result = await loadTaskForTagWrite(supabase, { id: COLLABORATOR_ID }, 'task-1');

        expect(result.spaceId).toBeNull();
        expect(result.failure?.code).toBe('PERMISSION_READ_ONLY');
    });

    it('refuses a caller who is not a member of the space at all', async () => {
        const supabase = clientFor('user-stranger');

        const result = await loadTaskForTagWrite(supabase, { id: 'user-stranger' }, 'task-1');

        expect(result.spaceId).toBeNull();
        expect(result.failure?.code).toBe('PERMISSION_NOT_A_MEMBER');
    });

    it('reports a task not found without a permission code, for a task id that does not exist', async () => {
        const supabase = clientFor(OWNER_ID);

        const result = await loadTaskForTagWrite(supabase, { id: OWNER_ID }, 'task-missing');

        expect(result).toEqual({ spaceId: null, failure: { error: 'Task not found' } });
    });
});
