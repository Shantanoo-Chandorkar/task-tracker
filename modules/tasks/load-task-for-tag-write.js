import {
    blockWriteForPermission,
    getSpaceIdForTask,
    resolveSpacePermission,
} from '@/lib/permissions/space-permissions';

/**
 * Finds a task's space and checks the caller may change the task, which is what tagging or untagging it does.
 *
 * @param {object} supabase - Request-scoped Supabase client
 * @param {object} user - The signed-in user
 * @param {string} taskId - Task being tagged or untagged
 * @returns {Promise<{ spaceId: string, failure: null }|{ spaceId: null, failure: object }>} The task's space, or the
 *   failure to return to the caller (not found, or the permission refusal)
 * @throws {Error} Generic SERVER_LOAD_FAILED error when a read fails
 */
export async function loadTaskForTagWrite(supabase, user, taskId) {
    const spaceId = await getSpaceIdForTask(supabase, taskId);
    if (!spaceId) return { spaceId: null, failure: { error: 'Task not found' } };

    const { data: task } = await supabase
        .from('tasks')
        .select('created_by')
        .eq('id', taskId)
        .maybeSingle();

    const permissionLevel = await resolveSpacePermission(supabase, spaceId);
    const permissionBlock = blockWriteForPermission(permissionLevel, {
        isOwnRow: task?.created_by === user.id,
    });
    if (permissionBlock) return { spaceId: null, failure: permissionBlock };

    return { spaceId, failure: null };
}
