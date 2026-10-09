import { fetchAllRows } from '@/lib/supabase/fetch-all-rows';

export const LIST_TASK_COLUMNS =
    '*, statuses(id, name, color, is_default, position), task_tags(tags(id, name, color))';

/**
 * Loads every task of one list with status and tags flattened, paged past the row cap.
 *
 * @param {object} supabase - Supabase server client
 * @param {string} listId - List whose tasks to load
 * @returns {Promise<{ data: object[]|null, error: object|null }>} Flat task rows, or the query error
 */
export async function fetchListTasks(supabase, listId) {
    const { data: taskRows, error } = await fetchAllRows(({ from, to }) =>
        supabase
            .from('tasks')
            .select(LIST_TASK_COLUMNS)
            .eq('list_id', listId)
            .order('depth', { ascending: true })
            .order('position', { ascending: true })
            // Unique tiebreaker so pages never repeat or skip rows that share depth and position
            .order('id', { ascending: true })
            .range(from, to),
    );
    if (error) return { data: null, error };

    // Flattens the statuses and task_tags joins so callers don't need to know either's structure.
    const tasks = taskRows.map((task) => ({
        ...task,
        status_name: task.statuses?.name ?? null,
        status_color: task.statuses?.color ?? null,
        tags: (task.task_tags || []).map((taskTagRow) => taskTagRow.tags),
    }));
    return { data: tasks, error: null };
}
