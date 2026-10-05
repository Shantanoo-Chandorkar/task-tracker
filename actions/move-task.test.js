import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from './test-support/fake-supabase';

const OWNER_ID = 'user-owner';
const COLLABORATOR_ID = 'user-collab';

let currentUserId;
let fake;

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fake.client }));
vi.mock('@/lib/auth/session', () => ({
    getCurrentUser: async () => ({ id: currentUserId }),
}));

/**
 * One list with three levels under task-a, more roots, and a sublist holding task-f and its child task-g.
 * Depths: a=0, b=1, c=2, d=0, e=0, f=0, g=1.
 */
function buildTables({ maxSubtasksPerParent = null } = {}) {
    const buildTask = (id, parentId, depth, extra = {}) => ({
        id,
        list_id: 'list-1',
        parent_id: parentId,
        sublist_id: null,
        depth,
        position: 1,
        created_by: OWNER_ID,
        ...extra,
    });
    return {
        spaces: [
            { id: 'space-1', owner_id: OWNER_ID, max_subtasks_per_parent: maxSubtasksPerParent },
        ],
        space_collaborators: [
            {
                space_id: 'space-1',
                user_id: COLLABORATOR_ID,
                status: 'accepted',
                permission_level: 'read_only',
            },
        ],
        lists: [
            { id: 'list-1', space_id: 'space-1' },
            { id: 'list-2', space_id: 'space-1' },
        ],
        sublists: [
            { id: 'sublist-1', list_id: 'list-1' },
            { id: 'sublist-other', list_id: 'list-2' },
        ],
        tasks: [
            buildTask('task-a', null, 0, { position: 1 }),
            buildTask('task-b', 'task-a', 1, { position: 1 }),
            buildTask('task-c', 'task-b', 2, { position: 1 }),
            buildTask('task-d', null, 0, { position: 2 }),
            buildTask('task-e', null, 0, { position: 3 }),
            buildTask('task-f', null, 0, { position: 4, sublist_id: 'sublist-1' }),
            buildTask('task-g', 'task-f', 1, { position: 1 }),
        ],
    };
}

async function moveTaskWith(taskId, fields, tablesOptions) {
    fake = createFakeSupabase({ tables: buildTables(tablesOptions) });
    const { moveTask } = await import('./task-actions');
    return moveTask(taskId, fields);
}

describe('moveTask', () => {
    beforeEach(() => {
        currentUserId = OWNER_ID;
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('reports a task that does not exist', async () => {
        const moveResult = await moveTaskWith('task-missing', {});

        expect(moveResult).toEqual({ data: null, error: 'Task not found' });
    });

    it('refuses a read-only collaborator with the permission code', async () => {
        currentUserId = COLLABORATOR_ID;

        const moveResult = await moveTaskWith('task-d', { newParentId: 'task-a' });

        expect(moveResult.code).toBe('PERMISSION_READ_ONLY');
        expect(fake.rpcCalls).toHaveLength(0);
    });

    it('refuses to make a task its own parent', async () => {
        const moveResult = await moveTaskWith('task-d', { newParentId: 'task-d' });

        expect(moveResult.error).toBe('A task cannot be its own parent');
        expect(fake.rpcCalls).toHaveLength(0);
    });

    it('refuses to move a task into its own descendant', async () => {
        const moveResult = await moveTaskWith('task-a', { newParentId: 'task-c' });

        expect(moveResult.error).toBe('Cannot move a task into its own descendant');
        expect(fake.rpcCalls).toHaveLength(0);
    });

    it('refuses a move that pushes the task past the maximum depth', async () => {
        const moveResult = await moveTaskWith('task-d', { newParentId: 'task-c' });

        expect(moveResult.error).toBe('Move would exceed maximum nesting depth');
        expect(fake.rpcCalls).toHaveLength(0);
    });

    it('counts the whole subtree when checking the maximum depth', async () => {
        const moveResult = await moveTaskWith('task-a', { newParentId: 'task-e' });

        expect(moveResult.error).toBe('Move would exceed maximum nesting depth');
    });

    it('moves a root task under a parent with the parent depth plus one', async () => {
        const moveResult = await moveTaskWith('task-d', { newParentId: 'task-a' });

        expect(moveResult.error).toBeNull();
        expect(fake.rpcCalls).toHaveLength(1);
        expect(fake.rpcCalls[0].args).toMatchObject({
            p_task_id: 'task-d',
            p_new_parent_id: 'task-a',
            p_new_sublist_id: null,
            p_new_depth: 1,
            p_new_list_id: 'list-1',
        });
    });

    it('places a task after a named sibling', async () => {
        await moveTaskWith('task-d', { newParentId: 'task-a', afterSiblingId: 'task-b' });

        expect(fake.rpcCalls[0].args.p_new_position).toBeGreaterThan(1);
    });

    it('promotes a subtask to the root inside the sublist of its original root task', async () => {
        const moveResult = await moveTaskWith('task-g', { newParentId: null });

        expect(moveResult.error).toBeNull();
        expect(fake.rpcCalls[0].args).toMatchObject({
            p_task_id: 'task-g',
            p_new_parent_id: null,
            p_new_sublist_id: 'sublist-1',
            p_new_depth: 0,
        });
    });

    it('promotes a subtask with no sublist when its root task is in none', async () => {
        await moveTaskWith('task-b', { newParentId: null });

        expect(fake.rpcCalls[0].args.p_new_sublist_id).toBeNull();
    });

    it('moves a root task to the top level of an explicit sublist', async () => {
        await moveTaskWith('task-d', { sublistId: 'sublist-1' });

        expect(fake.rpcCalls[0].args).toMatchObject({
            p_new_sublist_id: 'sublist-1',
            p_new_parent_id: null,
        });
    });

    it('moves a task out of every sublist when sublistId is null', async () => {
        await moveTaskWith('task-f', { sublistId: null });

        expect(fake.rpcCalls[0].args.p_new_sublist_id).toBeNull();
    });

    it('refuses a sublist that belongs to a different list', async () => {
        const moveResult = await moveTaskWith('task-d', { sublistId: 'sublist-other' });

        expect(moveResult.error).toBe('Sublist does not belong to this list');
        expect(fake.rpcCalls).toHaveLength(0);
    });

    it('refuses a subtask that is given a sublist directly', async () => {
        const moveResult = await moveTaskWith('task-d', {
            newParentId: 'task-a',
            sublistId: 'sublist-1',
        });

        expect(moveResult.error).toBe("A subtask can't belong to a sublist directly");
    });

    it('refuses a move under a parent that is already at the subtask cap', async () => {
        const moveResult = await moveTaskWith(
            'task-d',
            { newParentId: 'task-a' },
            { maxSubtasksPerParent: 1 },
        );

        expect(moveResult.code).toBe('TASK_SUBTASK_CAP_REACHED');
        expect(fake.rpcCalls).toHaveLength(0);
    });

    it('does not count a reorder under the same parent against the cap', async () => {
        const moveResult = await moveTaskWith(
            'task-b',
            { newParentId: 'task-a' },
            { maxSubtasksPerParent: 1 },
        );

        expect(moveResult.error).toBeNull();
    });

    it('reads the whole list of tasks only once, however many checks need it', async () => {
        await moveTaskWith('task-d', { newParentId: 'task-a' });

        const wholeListReads = fake.queries.filter(
            ({ tableName, filters }) =>
                tableName === 'tasks' &&
                filters.length === 1 &&
                filters[0].column === 'list_id' &&
                filters[0].operator === 'eq',
        );
        expect(wholeListReads).toHaveLength(1);
    });

    it('sees descendants past the 1000 row cap when checking for a cycle', async () => {
        const tables = buildTables();
        const fillerTasks = Array.from({ length: 1005 }, (_, index) => ({
            id: `filler-${String(index).padStart(4, '0')}`,
            list_id: 'list-1',
            parent_id: null,
            sublist_id: null,
            depth: 0,
            position: 10 + index,
            created_by: OWNER_ID,
        }));
        tables.tasks.push(...fillerTasks);
        // Last in the table, so an unpaged read that stops at 1000 rows never sees it
        tables.tasks.push({
            ...tables.tasks[0],
            id: 'zz-deep-child',
            parent_id: 'task-c',
            depth: 3,
            position: 1,
        });
        fake = createFakeSupabase({ tables });
        const { moveTask } = await import('./task-actions');

        const moveResult = await moveTask('task-a', { newParentId: 'zz-deep-child' });

        expect(moveResult.error).toBe('Cannot move a task into its own descendant');
    });

    it('passes a database failure through as a stable move code without leaking detail', async () => {
        fake = createFakeSupabase({
            tables: buildTables(),
            moveRpcResult: () => ({
                data: null,
                error: { code: 'P0001', message: 'TASK_MOVE_CYCLE raised internally' },
            }),
        });
        const { moveTask } = await import('./task-actions');

        const moveResult = await moveTask('task-d', { newParentId: 'task-a' });

        expect(moveResult.code).toBe('TASK_MOVE_CYCLE');
        expect(JSON.stringify(moveResult)).not.toContain('raised internally');
    });
});
