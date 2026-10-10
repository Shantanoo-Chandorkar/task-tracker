'use server';

import { createClient } from '@/lib/supabase/server';
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows';
import { NESTING_MODE, FINITE_MAX_DEPTH } from '@/lib/nesting-depth';
import { deepCloneSubtree, snapshotMaxRelativeDepth } from '@/lib/tasks/task-relations';
import { blockCreateInSpace, blockIfSubtaskCapReached } from '@/lib/tasks/task-write-guards';
import { getPositionBetween } from '@/lib/tasks/fractional-index';
import { readClientId, findOwnRowById, isUniqueViolation } from '@/lib/idempotent-create';
import { getCurrentUser } from '@/lib/auth/session';
import { withAuthenticatedAction } from '@/lib/auth/with-authenticated-action';
import { toGuestLimitResult } from '@/lib/guest/guest-database-errors';
import { toTaskRateLimitResult } from '@/lib/tasks/task-rate-limit';
import { NOT_AUTHENTICATED, TASK_NOT_FOUND, TASK_DUPLICATE_FAILED } from '@/lib/error-codes';

/**
 * Refuses a copy whose subtree would pass the depth limit or whose parent is already at the subtask cap.
 *
 * @param {object} supabase - Request-scoped Supabase client
 * @param {object} task - The task being copied (with list_id, depth and parent_id)
 * @returns {Promise<{ error: string, code?: string }|null>} The refusal, or null to proceed
 * @throws {Error} Generic SERVER_LOAD_FAILED error when a cap read fails
 */
async function blockInvalidDuplicateShape(supabase, task) {
    // Depth check needs only ids and parents; paged so a list past 1000 rows is not cut short.
    const { data: listTaskLinks, error: listTaskLinksError } = await fetchAllRows(({ from, to }) =>
        supabase
            .from('tasks')
            .select('id, parent_id')
            .eq('list_id', task.list_id)
            .order('id', { ascending: true })
            .range(from, to),
    );
    if (listTaskLinksError) {
        console.error('[duplicateTask] subtree read failed', {
            taskId: task.id,
            code: listTaskLinksError.code,
            detail: listTaskLinksError.message,
        });
        return { error: 'Failed to duplicate task' };
    }

    const snapshot = deepCloneSubtree(task.id, listTaskLinks);
    if (!snapshot) return { error: 'Task not found' };

    // MAX_DEPTH_CONSTANT - the copy keeps the original's depth, but a deep subtree can still pass the limit
    if (
        NESTING_MODE === 'finite' &&
        task.depth + snapshotMaxRelativeDepth(snapshot) > FINITE_MAX_DEPTH
    ) {
        return { error: 'Duplicating this task would exceed the maximum nesting depth' };
    }

    if (task.parent_id) return blockIfSubtaskCapReached(supabase, task.parent_id);
    return null;
}

/**
 * Finds the position right after the original task, between it and its next sibling.
 *
 * @param {object} supabase - Request-scoped Supabase client
 * @param {object} task - The task being copied (with list_id, parent_id, sublist_id and position)
 * @returns {Promise<number>} The position for the copy's root
 */
async function resolveCopyPosition(supabase, task) {
    let siblingsQuery = supabase
        .from('tasks')
        .select('id, position')
        .eq('list_id', task.list_id)
        .neq('id', task.id)
        .order('position', { ascending: true });
    siblingsQuery = task.parent_id
        ? siblingsQuery.eq('parent_id', task.parent_id)
        : siblingsQuery.is('parent_id', null);
    if (!task.parent_id) {
        siblingsQuery = task.sublist_id
            ? siblingsQuery.eq('sublist_id', task.sublist_id)
            : siblingsQuery.is('sublist_id', null);
    }

    const { data: siblings = [] } = await siblingsQuery;
    const nextSibling = siblings.find((sibling) => sibling.position > task.position);
    return getPositionBetween(task.position, nextSibling?.position ?? null);
}

/**
 * Duplicates a task and its whole subtree, inserting the copy as the next
 * sibling right after the original. Generates new UUIDs for every node so
 * the duplicate is fully independent. Appends ' (copy)' to the root title.
 *
 * Not built on withAuthenticatedAction - its catch also runs toGuestLimitResult on the thrown error.
 *
 * @param {string} taskId - Task to duplicate
 * @param {string} [newRootId] - Optional client-made UUID for the copy; a retry with it finds the first try's copy
 * @returns {{ error: string|null, code: string|undefined }}
 */
export async function duplicateTask(taskId, newRootId) {
    const user = await getCurrentUser();
    if (!user) return { error: 'You must be logged in', code: NOT_AUTHENTICATED };

    if (!taskId) return { error: 'Task ID is required' };

    const clientId = readClientId({ id: newRootId });
    if (clientId.failure) return clientId.failure;

    try {
        const supabase = await createClient();

        // A retry finds the copy the first try made, before any trigger or limit can refuse the repeat
        if (await findOwnRowById(supabase, 'tasks', clientId.id, 'created_by', user.id)) {
            return { error: null };
        }

        const { data: task, error: taskError } = await supabase
            .from('tasks')
            .select('*, lists(space_id)')
            .eq('id', taskId)
            .single();
        if (taskError || !task) return { error: 'Task not found' };

        // Duplicating creates new rows, so this is a create-permission check, not row ownership.
        const permissionBlock = await blockCreateInSpace(supabase, task.lists?.space_id);
        if (permissionBlock) return permissionBlock;

        const shapeBlock = await blockInvalidDuplicateShape(supabase, task);
        if (shapeBlock) return shapeBlock;

        // One transaction and one INSERT, so a failure never leaves a half-copied subtree.
        const { error: duplicateError } = await supabase.rpc('duplicate_task_subtree', {
            p_task_id: taskId,
            p_new_root_position: await resolveCopyPosition(supabase, task),
            ...(clientId.id && { p_new_root_id: clientId.id }),
        });
        if (duplicateError) {
            // Two requests with the same id at once: the loser's copy already exists, which is the result wanted
            const isOwnCopy =
                isUniqueViolation(duplicateError) &&
                (await findOwnRowById(supabase, 'tasks', clientId.id, 'created_by', user.id));
            if (isOwnCopy) return { error: null };
            return toDuplicateTaskFailure(taskId, duplicateError);
        }

        return { error: null };
    } catch (thrown) {
        console.error('[tasks] duplicate threw', { taskId, detail: thrown?.message });
        return { error: 'Failed to duplicate task', code: TASK_DUPLICATE_FAILED };
    }
}

/**
 * Maps a duplicate_task_subtree database error to a stable code; anything unrecognised is logged and kept generic.
 *
 * @param {string} taskId - Task whose duplication failed, for the log line
 * @param {{ code?: string, message?: string }} duplicateError - Error returned by the rpc call
 * @returns {{ error: string, code: string }} User-safe message and stable code
 */
function toDuplicateTaskFailure(taskId, duplicateError) {
    const guestLimitResult = toGuestLimitResult(duplicateError);
    if (guestLimitResult) return guestLimitResult;
    const rateLimitResult = toTaskRateLimitResult(duplicateError);
    if (rateLimitResult) return rateLimitResult;
    if (duplicateError.message?.includes('TASK_NOT_FOUND')) {
        return { error: 'Task not found', code: TASK_NOT_FOUND };
    }
    console.error('[tasks] duplicate failed', { taskId, dbCode: duplicateError.code });
    return { error: 'Failed to duplicate task', code: TASK_DUPLICATE_FAILED };
}
