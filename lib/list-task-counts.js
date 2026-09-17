/**
 * Attaches a `task_count` field to each list.
 *
 * Shared by the `/api/lists` route and the list-detail server page, so both compute it
 * identically and hydration never mismatches on this field.
 *
 * @param {object} supabase - Supabase server client
 * @param {object[]} lists - Lists to annotate
 * @returns {Promise<object[]>} The same lists, each with a `task_count` added
 */
export async function attachTaskCounts(supabase, lists) {
    const { data: tasks } = await supabase.from('tasks').select('list_id');

    const taskCountByListId = new Map();
    for (const task of tasks || []) {
        taskCountByListId.set(task.list_id, (taskCountByListId.get(task.list_id) ?? 0) + 1);
    }

    return lists.map((list) => ({
        ...list,
        task_count: taskCountByListId.get(list.id) ?? 0,
    }));
}
