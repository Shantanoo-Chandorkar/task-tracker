import { findDescendantIds } from '@/lib/tree';

/**
 * Looks up the id of a space's built-in "done" status.
 *
 * @param {object} supabase - Supabase server client
 * @param {string} spaceId - Space to look the done status up in
 * @returns {Promise<string|null>} The done status id, or null if not configured
 */
export async function getDoneStatusId(supabase, spaceId) {
    const { data: doneStatus } = await supabase
        .from('statuses')
        .select('id')
        .eq('code', 'done')
        .eq('space_id', spaceId)
        .single();
    return doneStatus?.id ?? null;
}

/**
 * Looks up the id of a space's default status - the target for an "uncomplete" cascade.
 *
 * @param {object} supabase - Supabase server client
 * @param {string} spaceId - Space to look the default status up in
 * @returns {Promise<string|null>} The default status id, or null if not configured
 */
export async function getDefaultStatusId(supabase, spaceId) {
    const { data: defaultStatus } = await supabase
        .from('statuses')
        .select('id')
        .eq('is_default', true)
        .eq('space_id', spaceId)
        .single();
    return defaultStatus?.id ?? null;
}

/**
 * Fetches a task's list_id/space_id/created_by plus a lightweight id/parent_id view of every
 * task in that list - enough to walk the tree with `findDescendantIds` without pulling full rows.
 *
 * @param {object} supabase - Supabase server client
 * @param {string} taskId - Task whose list-mates are being fetched
 * @returns {Promise<{ task: object|null, listTasks: object[] }>} The task row (with space_id, created_by) and its list's tree shape
 */
export async function getTaskListTree(supabase, taskId) {
    const { data: task } = await supabase
        .from('tasks')
        .select('list_id, created_by, lists(space_id)')
        .eq('id', taskId)
        .single();
    if (!task) return { task: null, listTasks: [] };

    const { data: listTasks = [] } = await supabase
        .from('tasks')
        .select('id, parent_id')
        .eq('list_id', task.list_id);

    return {
        task: { list_id: task.list_id, space_id: task.lists?.space_id ?? null, created_by: task.created_by },
        listTasks,
    };
}

/**
 * Checks whether a task can be marked done - true only when every descendant, any depth,
 * is already in the done status.
 *
 * @param {object} supabase - Supabase server client
 * @param {string} taskId - Task being marked done
 * @param {string} doneStatusId - The id of the "done" status
 * @returns {Promise<boolean>} Whether the task is safe to mark done
 */
export async function canMarkTaskDone(supabase, taskId, doneStatusId) {
    const { task, listTasks } = await getTaskListTree(supabase, taskId);
    if (!task) return true;

    const descendantIds = findDescendantIds(taskId, listTasks);
    if (descendantIds.size === 0) return true;

    const { data: incompleteDescendants = [] } = await supabase
        .from('tasks')
        .select('id')
        .in('id', Array.from(descendantIds))
        .neq('status_id', doneStatusId);

    return incompleteDescendants.length === 0;
}
