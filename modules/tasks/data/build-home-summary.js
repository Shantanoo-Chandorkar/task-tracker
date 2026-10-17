import { attachTaskCounts } from '@/modules/tasks/data/list-task-counts';

const PRIORITY_TASK_LIMIT = 8;
const RECENT_TASK_LIMIT = 8;
const RECENT_LIST_LIMIT = 5;
const RECENT_SUBLIST_LIMIT = 5;
// How many of the newest-changed tasks are scanned to work out recent tasks, lists and sublists
const RECENT_TASK_SCAN_LIMIT = 200;
// Fetched separately so an old starred task still shows; extra rows cover the done ones filtered out later
const PRIORITY_TASK_SCAN_LIMIT = 30;

const TASK_COLUMNS =
    'id, title, parent_id, list_id, sublist_id, is_prioritised, due_date, updated_at, statuses(code, name, color)';

/**
 * Trims a task row to the fields the Home screen shows, with its list details attached.
 *
 * @param {Record<string, any>} task - Task row with a joined `statuses` object.
 * @param {Record<string, any>} list - The list the task belongs to.
 * @returns {Record<string, any>} Task summary safe to send to the browser.
 */
function toTaskSummary(task, list) {
    return {
        id: task.id,
        title: task.title,
        list_id: list.id,
        list_name: list.name,
        list_color: list.color ?? null,
        status_name: task.statuses?.name ?? null,
        status_color: task.statuses?.color ?? null,
        is_prioritised: Boolean(task.is_prioritised),
        due_date: task.due_date ?? null,
        updated_at: task.updated_at,
    };
}

/**
 * Finds the top-level ancestor of a task among the fetched tasks.
 *
 * @param {Record<string, any>} task - Task to start from.
 * @param {Map<string, Record<string, any>>} tasksById - Fetched tasks keyed by task id.
 * @returns {Record<string, any>|null} The root task, or null when a parent was not fetched.
 */
function findRootTask(task, tasksById) {
    const visitedTaskIds = new Set();
    /** @type {Record<string, any>|undefined} */
    let currentTask = task;

    while (currentTask?.parent_id) {
        // A parent loop would otherwise never end
        if (visitedTaskIds.has(currentTask.id)) return null;
        visitedTaskIds.add(currentTask.id);
        currentTask = tasksById.get(currentTask.parent_id);
        if (!currentTask) return null;
    }
    return currentTask ?? null;
}

/**
 * Builds the Home screen data from already-fetched rows. Pure, so it can be tested without a database.
 *
 * @param {object} rows
 * @param {Record<string, any>[]} rows.recentTasks - Newest-changed tasks first, each with a joined `statuses` object.
 * @param {Record<string, any>[]} rows.priorityCandidates - Starred tasks, newest-changed first, each with `statuses`.
 * @param {Record<string, any>[]} rows.lists - Every list the user can see, each with `task_count`.
 * @param {Record<string, any>[]} rows.sublists - Every sublist the user can see.
 * @returns {{ priorityTasks: Record<string, any>[], recentTasks: Record<string, any>[], recentLists: Record<string, any>[], recentSublists: Record<string, any>[] }}
 */
export function buildHomeSummary({ recentTasks, priorityCandidates, lists, sublists }) {
    const listsById = new Map(lists.map((list) => [list.id, list]));
    const sublistsById = new Map(sublists.map((sublist) => [sublist.id, sublist]));
    const recentTasksById = new Map(recentTasks.map((task) => [task.id, task]));

    const priorityTasks = priorityCandidates
        .filter((task) => task.statuses?.code !== 'done' && listsById.has(task.list_id))
        .slice(0, PRIORITY_TASK_LIMIT)
        // listsById.has() was just checked above, so .get() is never undefined here
        .map((task) =>
            toTaskSummary(task, /** @type {Record<string, any>} */ (listsById.get(task.list_id))),
        );

    const recentTaskSummaries = recentTasks
        .filter((task) => listsById.has(task.list_id))
        .slice(0, RECENT_TASK_LIMIT)
        .map((task) =>
            toTaskSummary(task, /** @type {Record<string, any>} */ (listsById.get(task.list_id))),
        );

    const recentListIds = [...new Set(recentTasks.map((task) => task.list_id))]
        .filter((listId) => listsById.has(listId))
        .slice(0, RECENT_LIST_LIMIT);

    // ponytail: a nested task whose root is outside the scanned tasks does not bump its sublist
    /** @type {string[]} */
    const recentSublistIds = [];
    for (const task of recentTasks) {
        const rootTask = findRootTask(task, recentTasksById);
        const sublistId = rootTask?.sublist_id;
        if (sublistId && sublistsById.has(sublistId) && !recentSublistIds.includes(sublistId)) {
            recentSublistIds.push(sublistId);
        }
        if (recentSublistIds.length === RECENT_SUBLIST_LIMIT) break;
    }

    return {
        priorityTasks,
        recentTasks: recentTaskSummaries,
        recentLists: recentListIds.map((listId) => {
            // recentListIds was filtered to ids listsById.has(), so .get() is never undefined here
            const { id, name, color, space_id, task_count } = /** @type {Record<string, any>} */ (
                listsById.get(listId)
            );
            return { id, name, color: color ?? null, space_id, task_count: task_count ?? 0 };
        }),
        recentSublists: recentSublistIds.map((sublistId) => {
            // recentSublistIds only ever gets ids sublistsById.has(), so .get() is never undefined here
            const { id, name, color, list_id } = /** @type {Record<string, any>} */ (
                sublistsById.get(sublistId)
            );
            return {
                id,
                name,
                color: color ?? null,
                list_id,
                list_name: listsById.get(list_id)?.name ?? null,
            };
        }),
    };
}

/**
 * Fetches what the Home screen needs and builds its summary. Shared by the Home page and `/api/home`.
 * Row access is limited to the caller by the database's row-level security.
 *
 * @param {SupabaseClient} supabase - Supabase server client.
 * @returns {Promise<{ data: Record<string, any>|null, error: string|null }>} The summary, or a generic error message.
 */
export async function loadHomeSummary(supabase) {
    try {
        const [recentTasksResult, priorityTasksResult, listsResult, sublistsResult] =
            await Promise.all([
                supabase
                    .from('tasks')
                    .select(TASK_COLUMNS)
                    .order('updated_at', { ascending: false })
                    .limit(RECENT_TASK_SCAN_LIMIT),
                supabase
                    .from('tasks')
                    .select(TASK_COLUMNS)
                    .eq('is_prioritised', true)
                    .order('updated_at', { ascending: false })
                    .limit(PRIORITY_TASK_SCAN_LIMIT),
                supabase.from('lists').select('id, name, color, space_id'),
                supabase.from('sublists').select('id, name, color, list_id'),
            ]);

        const failedQueryResult = [
            recentTasksResult,
            priorityTasksResult,
            listsResult,
            sublistsResult,
        ].find((queryResult) => queryResult.error);
        if (failedQueryResult) {
            console.error('[home] load failed', {
                code: failedQueryResult.error?.code,
                detail: failedQueryResult.error?.message,
            });
            return { data: null, error: 'Failed to load home' };
        }

        const listsWithCounts = await attachTaskCounts(supabase, listsResult.data ?? []);

        const homeSummary = buildHomeSummary({
            recentTasks: recentTasksResult.data ?? [],
            priorityCandidates: priorityTasksResult.data ?? [],
            lists: listsWithCounts,
            sublists: sublistsResult.data ?? [],
        });

        return { data: { ...homeSummary, generated_at: new Date().toISOString() }, error: null };
    } catch (thrown) {
        console.error('[home] load threw', {
            detail: thrown instanceof Error ? thrown.message : undefined,
        });
        return { data: null, error: 'Failed to load home' };
    }
}
