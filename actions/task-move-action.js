'use server';

import { fetchAllRows } from '@/lib/supabase/fetch-all-rows';
import { throwIfQueryFailed } from '@/lib/supabase/throw-if-query-failed';
import {
    wouldCreateCycle,
    exceedsMaxDepthAfterMove,
    resolveRootAncestorSublistId,
} from '@/lib/tasks/move-task-checks';
import { NESTING_MODE, FINITE_MAX_DEPTH } from '@/lib/nesting-depth';
import { computeNewPosition } from '@/lib/tasks/compute-new-position';
import { resolveDepthBelowParent } from '@/lib/tasks/resolve-depth-below-parent';
import {
    blockWriteInSpace,
    blockIfSubtaskCapReached,
    blockIfSublistNotInList,
} from '@/lib/tasks/task-write-guards';
import { withAuthenticatedAction } from '@/lib/auth/with-authenticated-action';
import { toTaskRateLimitResult } from '@/lib/tasks/task-rate-limit';
import {
    TASK_MOVE_CYCLE,
    TASK_MOVE_FORBIDDEN_DESCENDANTS,
    TASK_MOVE_FAILED,
} from '@/lib/error-codes';

/**
 * Makes a loader for the id/parent/depth view of every task in a list, reading it at most once.
 *
 * Only some moves need the whole list, so nothing is read until a check asks for it.
 *
 * @param {object} supabase - Request-scoped Supabase client
 * @param {string} listId - List whose tasks are loaded
 * @returns {() => Promise<object[]>} Returns the same pending read on every call
 * @throws {Error} Generic SERVER_LOAD_FAILED error (from the returned loader) when the read fails
 */
function createListTaskLinksLoader(supabase, listId) {
    let listTaskLinksPromise;
    return () => {
        listTaskLinksPromise ??= fetchAllRows(({ from, to }) =>
            supabase
                .from('tasks')
                .select('id, parent_id, depth, sublist_id')
                .eq('list_id', listId)
                .order('id', { ascending: true })
                .range(from, to),
        ).then((listTaskLinksResult) => {
            throwIfQueryFailed('[tasks] move', listTaskLinksResult);
            return listTaskLinksResult.data;
        });
        return listTaskLinksPromise;
    };
}

/**
 * Works out which sublist a root-level task lands in: the explicit one, the promoted task's old root's, or its own.
 *
 * @param {object} task - The task being moved
 * @param {string|null|undefined} explicitSublistId - Sublist the caller asked for; undefined means "not specified"
 * @param {() => Promise<object[]>} loadListTaskLinks - Reads the list's tasks when a promotion needs them
 * @returns {Promise<string|null>} The sublist id, or null for the main list
 */
async function resolveRootSublistId(task, explicitSublistId, loadListTaskLinks) {
    if (explicitSublistId !== undefined) return explicitSublistId ?? null;
    if (task.parent_id) return resolveRootAncestorSublistId(task.id, await loadListTaskLinks());
    return task.sublist_id ?? null;
}

/**
 * Reads the siblings (id and position) the moved task will sit among, in position order.
 *
 * @param {object} supabase - Request-scoped Supabase client
 * @param {object} target - Where the task is going
 * @param {string} target.taskId - Task being moved, excluded from its new siblings
 * @param {string|null} target.newParentId - New parent, or null for a root-level move
 * @param {string} target.listId - Target list (used for root-level moves)
 * @param {string|null} target.sublistId - Target sublist (used for root-level moves)
 * @returns {Promise<{ id: string, position: number }[]|null>} The siblings
 */
async function loadNewSiblings(supabase, { taskId, newParentId, listId, sublistId }) {
    const siblingsQuery = supabase
        .from('tasks')
        .select('id, position')
        .neq('id', taskId)
        .order('position', { ascending: true });
    if (newParentId) {
        const { data: siblings } = await siblingsQuery.eq('parent_id', newParentId);
        return siblings;
    }

    const rootSiblingsQuery = siblingsQuery.eq('list_id', listId).is('parent_id', null);
    const { data: siblings } = await (sublistId
        ? rootSiblingsQuery.eq('sublist_id', sublistId)
        : rootSiblingsQuery.is('sublist_id', null));
    return siblings;
}

/**
 * Refuses a move that would create a cycle, break the subtask cap, or push the subtree past the depth limit.
 *
 * @param {object} supabase - Request-scoped Supabase client
 * @param {object} task - The task being moved (with depth and parent_id)
 * @param {string|null|undefined} newParentId - Parent the task is being moved under
 * @param {() => Promise<object[]>} loadListTaskLinks - Reads the list's tasks when a check needs them
 * @returns {Promise<{ error: string, code?: string }|null>} The refusal, or null to proceed
 */
async function blockInvalidMoveShape(supabase, task, newParentId, loadListTaskLinks) {
    // Defense in depth - a self/descendant reparent creates a cycle that hangs every tree walker.
    if (newParentId === task.id) return { error: 'A task cannot be its own parent' };
    if (newParentId && wouldCreateCycle(task.id, newParentId, await loadListTaskLinks())) {
        return { error: 'Cannot move a task into its own descendant' };
    }

    if (newParentId && newParentId !== task.parent_id) {
        const capBlock = await blockIfSubtaskCapReached(supabase, newParentId);
        if (capBlock) return capBlock;
    }
    return null;
}

/**
 * Refuses a move that would push the task, or its deepest descendant, past the maximum nesting depth.
 *
 * @param {object} task - The task being moved (with depth)
 * @param {number} newDepth - Depth the task would have after the move
 * @param {() => Promise<object[]>} loadListTaskLinks - Reads the list's tasks when the check needs them
 * @returns {Promise<{ error: string }|null>} The refusal, or null to proceed
 */
async function blockMoveBeyondDepthLimit(task, newDepth, loadListTaskLinks) {
    const depthDelta = newDepth - task.depth;
    // MAX_DEPTH_CONSTANT
    if (NESTING_MODE !== 'finite' || depthDelta <= 0) return null;

    const depthExceeded = exceedsMaxDepthAfterMove({
        task,
        depthDelta,
        listTaskLinks: await loadListTaskLinks(),
        maxDepth: FINITE_MAX_DEPTH,
    });
    return depthExceeded ? { error: 'Move would exceed maximum nesting depth' } : null;
}

/**
 * Moves a task to a new parent, list, and/or sibling position, recomputing depth for it and every descendant.
 *
 * @param {string} taskId - Task to move
 * @param {object} fields
 * @param {string|null} [fields.newParentId] - New parent task, or null/omitted to move to root
 * @param {string|null} [fields.afterSiblingId] - Sibling to insert after, or null to append
 * @param {boolean} [fields.shouldPrependToStart] - Insert as the first sibling instead
 * @param {string} [fields.listId] - Target list, defaults to the task's current list
 * @param {string|null} [fields.sublistId] - Target sublist for a root-level move
 * @returns {{ data: object|null, error: string|null, code?: string }}
 */
export const moveTask = withAuthenticatedAction(
    '[tasks] move',
    'Unexpected error moving task',
    async (user, supabase, taskId, fields) => {
        const { newParentId, afterSiblingId, shouldPrependToStart, listId, sublistId } = fields;

        const { data: task, error: taskError } = await supabase
            .from('tasks')
            .select('*, lists(space_id)')
            .eq('id', taskId)
            .single();
        if (taskError || !task) return { data: null, error: 'Task not found' };

        const permissionBlock = await blockWriteInSpace(
            supabase,
            task.lists?.space_id,
            user.id,
            task.created_by,
        );
        if (permissionBlock) return { data: null, ...permissionBlock };

        const loadListTaskLinks = createListTaskLinksLoader(supabase, task.list_id);
        const targetListId = listId ?? task.list_id;

        const shapeBlock = await blockInvalidMoveShape(
            supabase,
            task,
            newParentId,
            loadListTaskLinks,
        );
        if (shapeBlock) return { data: null, ...shapeBlock };

        if (sublistId && newParentId) {
            return { data: null, error: "A subtask can't belong to a sublist directly" };
        }

        const newDepth = await resolveDepthBelowParent(supabase, newParentId);

        const depthBlock = await blockMoveBeyondDepthLimit(task, newDepth, loadListTaskLinks);
        if (depthBlock) return { data: null, ...depthBlock };

        let resolvedSublistId = null;
        if (!newParentId) {
            resolvedSublistId = await resolveRootSublistId(task, sublistId, loadListTaskLinks);
            if (resolvedSublistId) {
                const sublistBlock = await blockIfSublistNotInList(
                    supabase,
                    resolvedSublistId,
                    targetListId,
                );
                if (sublistBlock) return { data: null, ...sublistBlock };
            }
        }

        const siblings = await loadNewSiblings(supabase, {
            taskId,
            newParentId,
            listId: targetListId,
            sublistId: resolvedSublistId,
        });
        const newPosition = computeNewPosition(
            siblings || [],
            afterSiblingId,
            shouldPrependToStart,
        );

        // One transaction for the subtree and the task itself, so a failure can never leave a half-moved tree.
        const { data: movedTask, error: moveError } = await supabase
            .rpc('move_task_subtree', {
                p_task_id: taskId,
                p_new_parent_id: newParentId ?? null,
                p_new_sublist_id: newParentId ? null : resolvedSublistId,
                p_new_depth: newDepth,
                p_new_position: newPosition,
                p_new_list_id: targetListId,
            })
            .single();
        if (moveError) return { data: null, ...toMoveTaskFailure(taskId, moveError) };

        return { data: movedTask, error: null };
    },
);

/**
 * Maps a move_task_subtree database error to a stable code; anything unrecognised is logged and kept generic.
 *
 * @param {string} taskId - Task whose move failed, for the log line
 * @param {{ code?: string, message?: string }} moveError - Error returned by the rpc call
 * @returns {{ error: string, code: string }} User-safe message and stable code
 */
function toMoveTaskFailure(taskId, moveError) {
    const rateLimitResult = toTaskRateLimitResult(moveError);
    if (rateLimitResult) return rateLimitResult;
    if (moveError.message?.includes(TASK_MOVE_CYCLE)) {
        return { error: 'Cannot move a task into its own descendant', code: TASK_MOVE_CYCLE };
    }
    if (moveError.message?.includes(TASK_MOVE_FORBIDDEN_DESCENDANTS)) {
        return {
            error: "You can't move a task that contains subtasks you aren't allowed to edit",
            code: TASK_MOVE_FORBIDDEN_DESCENDANTS,
        };
    }
    console.error('[tasks] move failed', { taskId, dbCode: moveError.code });
    return { error: 'Failed to move task', code: TASK_MOVE_FAILED };
}
