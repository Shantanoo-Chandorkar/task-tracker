'use server';

import { findDescendantIds } from '@/lib/tasks/task-relations';
import { blockWriteInSpace } from '@/lib/tasks/task-write-guards';
import { getDefaultStatusId, getDoneStatusId, getTaskListTree } from '@/lib/tasks/task-completion';
import { withAuthenticatedAction } from '@/lib/auth/with-authenticated-action';
import { toTaskRateLimitResult } from '@/lib/tasks/task-rate-limit';

/**
 * Writes one status onto a task and every descendant in a single update.
 *
 * Gated on root-task ownership only - RLS still blocks any descendant the caller doesn't own.
 *
 * @param {object} user - Signed-in user
 * @param {object} supabase - Request-scoped Supabase client
 * @param {string} taskId - Root task of the cascade
 * @param {object} cascade - What this cascade writes
 * @param {(supabase: object, spaceId: string) => Promise<string|null>} cascade.lookupStatusId - Finds the status id
 * @param {string} cascade.missingStatusError - Message when the space has no such status
 * @param {string} cascade.logLabel - Prefix for the failure log line
 * @param {string} cascade.failureError - Message for an unexpected database failure
 * @returns {Promise<{ error: string|null, code?: string, completedCount?: number, totalCount?: number }>}
 *   `completedCount`/`totalCount` appear only when RLS let fewer rows through than asked for
 */
async function setStatusOnSubtree(user, supabase, taskId, cascade) {
    if (!taskId) return { error: 'Task ID is required' };

    const { task, listTasks } = await getTaskListTree(supabase, taskId);
    if (!task) return { error: 'Task not found' };

    const permissionBlock = await blockWriteInSpace(
        supabase,
        task.space_id,
        user.id,
        task.created_by,
    );
    if (permissionBlock) return permissionBlock;

    const statusId = await cascade.lookupStatusId(supabase, task.space_id);
    if (!statusId) return { error: cascade.missingStatusError };

    const idsToUpdate = [taskId, ...findDescendantIds(taskId, listTasks)];
    const { data: updatedRows, error } = await supabase
        .from('tasks')
        .update({ status_id: statusId })
        .in('id', idsToUpdate)
        .select('id');

    if (error) {
        console.error(`${cascade.logLabel} failed`, {
            taskId,
            code: error.code,
            detail: error.message,
        });
        return toTaskRateLimitResult(error) ?? { error: cascade.failureError };
    }

    const updatedCount = updatedRows?.length ?? 0;
    if (updatedCount < idsToUpdate.length) {
        return { error: null, completedCount: updatedCount, totalCount: idsToUpdate.length };
    }
    return { error: null };
}

/**
 * Marks a task and all its descendants (any depth) as done in one update. Used when
 * completing a parent that still has incomplete subtasks - the user has already
 * confirmed the cascade via a UI dialog before this is called.
 *
 * @param {string} taskId - Root task to complete along with its descendants
 * @returns {{ error: string|null }}
 */
export const completeTaskAndDescendants = withAuthenticatedAction(
    '[tasks] complete-cascade',
    'Unexpected error completing tasks',
    (user, supabase, taskId) =>
        setStatusOnSubtree(user, supabase, taskId, {
            lookupStatusId: getDoneStatusId,
            missingStatusError: 'No "done" status configured',
            logLabel: '[tasks] complete-cascade',
            failureError: 'Failed to mark tasks complete',
        }),
    { hasData: false },
);

/**
 * Marks a task and all its descendants as the default (not-done) status in one update.
 * Assumes the cascade-confirm dialog already ran - this just performs the write.
 *
 * @param {string} taskId - Root task to uncomplete along with its descendants
 * @returns {{ error: string|null }}
 */
export const uncompleteTaskAndDescendants = withAuthenticatedAction(
    '[tasks] uncomplete-cascade',
    'Unexpected error uncompleting tasks',
    (user, supabase, taskId) =>
        setStatusOnSubtree(user, supabase, taskId, {
            lookupStatusId: getDefaultStatusId,
            missingStatusError: 'No default status configured',
            logLabel: '[tasks] uncomplete-cascade',
            failureError: 'Failed to mark tasks incomplete',
        }),
    { hasData: false },
);
