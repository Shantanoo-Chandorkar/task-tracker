import { throwIfQueryFailed } from '@/lib/supabase/throw-if-query-failed';

/**
 * Attaches a `task_count` field to each list.
 *
 * Counted in the database (RLS still applies) so it stays correct past the PostgREST row cap.
 *
 * @param {object} supabase - Supabase server client
 * @param {object[]} lists - Lists to annotate
 * @returns {Promise<object[]>} The same lists, each with a `task_count` added
 * @throws {Error} Generic SERVER_LOAD_FAILED error when the count query fails
 */
export async function attachTaskCounts(supabase, lists) {
    const countsResult = await supabase.rpc('list_task_counts');
    throwIfQueryFailed('[list-task-counts]', countsResult);

    const taskCountByListId = new Map();
    for (const countRow of countsResult.data ?? []) {
        taskCountByListId.set(countRow.list_id, Number(countRow.task_count));
    }

    return lists.map((list) => ({
        ...list,
        task_count: taskCountByListId.get(list.id) ?? 0,
    }));
}
