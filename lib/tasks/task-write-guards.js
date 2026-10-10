import { throwIfQueryFailed } from '@/lib/supabase/throw-if-query-failed';
import { TASK_NOT_FOUND, TASK_SUBTASK_CAP_REACHED } from '@/lib/error-codes';
import {
    resolveSpacePermission,
    getSpaceIdForTask,
    blockCreateForPermission,
    blockWriteForPermission,
} from '@/lib/permissions/space-permissions';

/**
 * Refuses a create the caller's permission tier does not allow in the space.
 *
 * @param {object} supabase - Request-scoped Supabase client
 * @param {string} spaceId - Space the new row would be created in
 * @returns {Promise<{ error: string, code: string }|null>} A refusal, or null to proceed
 * @throws {Error} Generic SERVER_LOAD_FAILED error when the permission read fails
 */
export async function blockCreateInSpace(supabase, spaceId) {
    const permissionLevel = await resolveSpacePermission(supabase, spaceId);
    return blockCreateForPermission(permissionLevel);
}

/**
 * Refuses an update or delete the caller's permission tier does not allow on a row.
 *
 * @param {object} supabase - Request-scoped Supabase client
 * @param {string} spaceId - Space the row belongs to
 * @param {string} userId - Caller's user id
 * @param {string|null} rowCreatedBy - `created_by` of the row being changed
 * @returns {Promise<{ error: string, code: string }|null>} A refusal, or null to proceed
 * @throws {Error} Generic SERVER_LOAD_FAILED error when the permission read fails
 */
export async function blockWriteInSpace(supabase, spaceId, userId, rowCreatedBy) {
    const permissionLevel = await resolveSpacePermission(supabase, spaceId);
    return blockWriteForPermission(permissionLevel, { isOwnRow: rowCreatedBy === userId });
}

/**
 * Rejects adding a new direct subtask under parentId if its space has a cap and it's already reached.
 *
 * @param {object} supabase - Request-scoped Supabase client
 * @param {string} parentId - Task that would receive a new direct child
 * @returns {Promise<{ error: string, code: string }|null>} A refusal, or null to proceed
 * @throws {Error} Generic SERVER_LOAD_FAILED error when a read fails
 */
export async function blockIfSubtaskCapReached(supabase, parentId) {
    const spaceId = await getSpaceIdForTask(supabase, parentId);
    if (!spaceId) return { error: 'Parent task not found', code: TASK_NOT_FOUND };

    const spaceResult = await supabase
        .from('spaces')
        .select('max_subtasks_per_parent')
        .eq('id', spaceId)
        .maybeSingle();
    throwIfQueryFailed('[tasks] subtask cap', spaceResult);
    const maxSubtasksPerParent = spaceResult.data?.max_subtasks_per_parent;
    if (!maxSubtasksPerParent) return null;

    const countResult = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('parent_id', parentId);
    throwIfQueryFailed('[tasks] subtask cap', countResult);

    if ((countResult.count ?? 0) >= maxSubtasksPerParent) {
        return {
            error: `This task already has the maximum of ${maxSubtasksPerParent} subtasks`,
            code: TASK_SUBTASK_CAP_REACHED,
        };
    }
    return null;
}

/**
 * Rejects a root task being placed in a sublist that belongs to a different list.
 *
 * @param {object} supabase - Request-scoped Supabase client
 * @param {string} sublistId - Sublist the task would be placed in
 * @param {string} listId - List the task belongs to
 * @returns {Promise<{ error: string }|null>} A refusal, or null when the sublist is in that list
 */
export async function blockIfSublistNotInList(supabase, sublistId, listId) {
    const { data: sublist } = await supabase
        .from('sublists')
        .select('list_id')
        .eq('id', sublistId)
        .single();
    if (!sublist || sublist.list_id !== listId) {
        return { error: 'Sublist does not belong to this list' };
    }
    return null;
}
