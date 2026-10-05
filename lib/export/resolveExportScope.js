import { findAncestors } from '@/lib/tree';
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows';
import { throwIfQueryFailed } from '@/lib/supabase/throw-if-query-failed';

/**
 * Reads every task matching a scope filter, paged so an export past the row cap is never cut short.
 *
 * @param {object} supabase - Supabase server client
 * @param {(tasksQuery: object) => object} applyScopeFilter - Adds the scope's `.eq`/`.in` filter to a tasks query
 * @returns {Promise<{ data: object[]|null, error: object|null }>} Every matching task, or the query error
 */
function fetchAllScopedTasks(supabase, applyScopeFilter) {
    return fetchAllRows(({ from, to }) =>
        applyScopeFilter(supabase.from('tasks').select('*'))
            .order('id', { ascending: true })
            .range(from, to),
    );
}

/**
 * Finds the sublist a task effectively belongs to - only root tasks carry `sublist_id`
 * directly, so a nested task inherits its root ancestor's sublist.
 *
 * @param {object} task - Task to resolve
 * @param {object[]} flatList - Flat list containing `task` and its ancestors
 * @returns {string|null} Effective sublist id, or null if the task isn't under a sublist
 */
function rootSublistId(task, flatList) {
    if (!task.parent_id) return task.sublist_id ?? null;
    const ancestors = findAncestors(task.id, flatList);
    const root = ancestors[ancestors.length - 1];
    return root ? (root.sublist_id ?? null) : (task.sublist_id ?? null);
}

/**
 * Enriches flat tasks with human-readable context (space/list/sublist/ancestor names) instead
 * of raw ids, per the export requirement that titles - not ids - are what users need to see.
 *
 * @param {object[]} flatList - Flat tasks to enrich (ancestors must be present for parent_path)
 * @param {object} context
 * @param {string|null} context.spaceName
 * @param {Map<string, string>} context.listNameById
 * @param {Map<string, string>} context.sublistNameById
 * @param {Map<string, string>} context.statusNameById
 * @returns {object[]} Export-ready rows; `id`/`parent_id` stay for `flatToTree` linking, stripped by formatters
 */
function enrichTasks(flatList, { spaceName, listNameById, sublistNameById, statusNameById }) {
    return flatList.map((task) => {
        const ancestorTitles = findAncestors(task.id, flatList)
            .reverse()
            .map((ancestor) => ancestor.title);

        return {
            id: task.id,
            title: task.title,
            description: task.description ?? null,
            status: statusNameById.get(task.status_id) ?? null,
            is_prioritised: Boolean(task.is_prioritised),
            is_recurring: Boolean(task.is_recurring),
            due_date: task.due_date ?? null,
            depth: task.depth,
            space: spaceName,
            list: listNameById.get(task.list_id) ?? null,
            sublist: sublistNameById.get(rootSublistId(task, flatList)) ?? null,
            parent_path: ancestorTitles.length > 0 ? ancestorTitles.join(' > ') : null,
            parent_id: task.parent_id ?? null,
        };
    });
}

/**
 * Resolves an export scope descriptor into a flat, export-ready row set.
 *
 * Adding a new scope type only means adding a case below - every caller (CSV/JSON formatting,
 * the UI trigger) stays unchanged.
 *
 * @param {object} supabase - Supabase server client
 * @param {object} scope
 * @param {'list'|'sublist'|'space'} scope.type
 * @param {string} scope.id
 * @returns {Promise<{scopeName: string, rows: object[]}|null>} Null if the scope id doesn't exist
 * @throws {Error} Generic SERVER_LOAD_FAILED error when a read fails, so a partial file is never served
 */
export async function resolveExportScope(supabase, { type, id }) {
    const statusesResult = await supabase.from('statuses').select('id, name');
    throwIfQueryFailed('[export]', statusesResult);
    const { data: statuses } = statusesResult;
    const statusNameById = new Map((statuses || []).map((status) => [status.id, status.name]));

    if (type === 'list') {
        const { data: list } = await supabase.from('lists').select('*').eq('id', id).single();
        if (!list) return null;

        const [spaceResult, sublistsResult, tasksResult] = await Promise.all([
            supabase.from('spaces').select('name').eq('id', list.space_id).single(),
            supabase.from('sublists').select('id, name').eq('list_id', id),
            fetchAllScopedTasks(supabase, (tasksQuery) => tasksQuery.eq('list_id', id)),
        ]);
        throwIfQueryFailed('[export]', sublistsResult, tasksResult);
        const { data: space } = spaceResult;
        const { data: sublists } = sublistsResult;
        const { data: tasks } = tasksResult;

        return {
            scopeName: list.name,
            rows: enrichTasks(tasks || [], {
                spaceName: space?.name ?? null,
                listNameById: new Map([[list.id, list.name]]),
                sublistNameById: new Map(
                    (sublists || []).map((sublist) => [sublist.id, sublist.name]),
                ),
                statusNameById,
            }),
        };
    }

    if (type === 'sublist') {
        const { data: sublist } = await supabase.from('sublists').select('*').eq('id', id).single();
        if (!sublist) return null;

        const [listResult, sublistsResult, listTasksResult] = await Promise.all([
            supabase.from('lists').select('*').eq('id', sublist.list_id).single(),
            supabase.from('sublists').select('id, name').eq('list_id', sublist.list_id),
            fetchAllScopedTasks(supabase, (tasksQuery) =>
                tasksQuery.eq('list_id', sublist.list_id),
            ),
        ]);
        throwIfQueryFailed('[export]', listResult, sublistsResult, listTasksResult);
        const { data: list } = listResult;
        const { data: sublists } = sublistsResult;
        const { data: listTasks } = listTasksResult;
        const { data: space } = await supabase
            .from('spaces')
            .select('name')
            .eq('id', list.space_id)
            .single();

        const allTasks = listTasks || [];
        const scopedTaskIds = new Set(
            allTasks.filter((task) => rootSublistId(task, allTasks) === id).map((task) => task.id),
        );
        const scopedTasks = allTasks.filter((task) => scopedTaskIds.has(task.id));

        return {
            scopeName: sublist.name,
            rows: enrichTasks(scopedTasks, {
                spaceName: space?.name ?? null,
                listNameById: new Map([[list.id, list.name]]),
                sublistNameById: new Map(
                    (sublists || []).map((sublistRow) => [sublistRow.id, sublistRow.name]),
                ),
                statusNameById,
            }),
        };
    }

    if (type === 'space') {
        const { data: space } = await supabase.from('spaces').select('*').eq('id', id).single();
        if (!space) return null;

        const listsResult = await supabase.from('lists').select('id, name').eq('space_id', id);
        throwIfQueryFailed('[export]', listsResult);
        const { data: lists } = listsResult;
        const listIds = (lists || []).map((list) => list.id);
        if (listIds.length === 0) return { scopeName: space.name, rows: [] };

        const [sublistsResult, tasksResult] = await Promise.all([
            supabase.from('sublists').select('id, name').in('list_id', listIds),
            fetchAllScopedTasks(supabase, (tasksQuery) => tasksQuery.in('list_id', listIds)),
        ]);
        throwIfQueryFailed('[export]', sublistsResult, tasksResult);
        const { data: sublists } = sublistsResult;
        const { data: tasks } = tasksResult;

        return {
            scopeName: space.name,
            rows: enrichTasks(tasks || [], {
                spaceName: space.name,
                listNameById: new Map((lists || []).map((list) => [list.id, list.name])),
                sublistNameById: new Map(
                    (sublists || []).map((sublist) => [sublist.id, sublist.name]),
                ),
                statusNameById,
            }),
        };
    }

    return null;
}
