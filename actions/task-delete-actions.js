'use server';

import { blockWriteInSpace } from '@/lib/tasks/task-write-guards';
import { withAuthenticatedAction } from '@/lib/auth/with-authenticated-action';
import { toTaskRateLimitResult } from '@/lib/tasks/task-rate-limit';
import {
    TASK_SUBTASK_CAP_REACHED,
    TASK_NOT_FOUND,
    TASK_REPARENT_FORBIDDEN_CHILDREN,
    TASK_REPARENT_DELETE_FAILED,
} from '@/lib/error-codes';

/**
 * Deletes a task by ID. Cascades to children via the database ON DELETE CASCADE constraint.
 *
 * @param {string} id - Task ID to delete
 * @returns {{ error: string|null }}
 */
export const deleteTask = withAuthenticatedAction(
    '[tasks] delete',
    'Unexpected error deleting task',
    async (user, supabase, id) => {
        if (!id) return { error: 'Task ID is required' };

        const { data: existingTask } = await supabase
            .from('tasks')
            .select('created_by, lists(space_id)')
            .eq('id', id)
            .maybeSingle();
        if (!existingTask) return { error: 'Task not found' };

        const permissionBlock = await blockWriteInSpace(
            supabase,
            existingTask.lists?.space_id,
            user.id,
            existingTask.created_by,
        );
        if (permissionBlock) return permissionBlock;

        const { data: deletedTask, error } = await supabase
            .from('tasks')
            .delete()
            .eq('id', id)
            .select()
            .maybeSingle();

        if (error || !deletedTask) {
            return toTaskRateLimitResult(error) ?? { error: 'Task not found' };
        }

        return { error: null };
    },
    { hasData: false },
);

/**
 * Deletes a task and re-parents its direct children to the deleted task's parent, in one database transaction.
 * Children take the gap where the deleted task sat; deeper descendants stay attached to their own parents.
 *
 * @param {string} taskId - ID of the task to delete
 * @returns {{ error: string|null }}
 */
export const deleteTaskAndReparentChildren = withAuthenticatedAction(
    '[tasks] reparent-delete',
    'Unexpected error during reparent-delete',
    async (user, supabase, taskId) => {
        if (!taskId) return { error: 'Task ID is required' };

        const { data: task, error: taskError } = await supabase
            .from('tasks')
            .select('created_by, lists(space_id)')
            .eq('id', taskId)
            .single();

        if (taskError || !task) return { error: 'Task not found' };

        const permissionBlock = await blockWriteInSpace(
            supabase,
            task.lists?.space_id,
            user.id,
            task.created_by,
        );
        if (permissionBlock) return permissionBlock;

        // One transaction: children are moved up and the task deleted together, so a failure changes nothing.
        const { error: reparentDeleteError } = await supabase.rpc('delete_task_reparent_children', {
            p_task_id: taskId,
        });
        if (reparentDeleteError) return toReparentDeleteFailure(taskId, reparentDeleteError);

        return { error: null };
    },
    { hasData: false },
);

/**
 * Maps a delete_task_reparent_children database error to a stable code; unrecognised errors are logged.
 *
 * @param {string} taskId - Task whose delete failed, for the log line
 * @param {{ code?: string, message?: string }} reparentDeleteError - Error returned by the rpc call
 * @returns {{ error: string, code: string }} User-safe message and stable code
 */
function toReparentDeleteFailure(taskId, reparentDeleteError) {
    const rateLimitResult = toTaskRateLimitResult(reparentDeleteError);
    if (rateLimitResult) return rateLimitResult;
    if (reparentDeleteError.message?.includes('TASK_NOT_FOUND')) {
        return { error: 'Task not found', code: TASK_NOT_FOUND };
    }
    if (reparentDeleteError.message?.includes(TASK_SUBTASK_CAP_REACHED)) {
        return {
            error: 'Deleting this task would give its parent more subtasks than this space allows',
            code: TASK_SUBTASK_CAP_REACHED,
        };
    }
    if (reparentDeleteError.message?.includes(TASK_REPARENT_FORBIDDEN_CHILDREN)) {
        return {
            error: "You can't delete this task while keeping subtasks you aren't allowed to edit",
            code: TASK_REPARENT_FORBIDDEN_CHILDREN,
        };
    }
    console.error('[tasks] reparent-delete failed', { taskId, dbCode: reparentDeleteError.code });
    return { error: 'Failed to delete task', code: TASK_REPARENT_DELETE_FAILED };
}
