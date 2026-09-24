import { findAncestors } from '@/lib/tree';

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
 */
export async function resolveExportScope(supabase, { type, id }) {
    const { data: statuses } = await supabase.from('statuses').select('id, name');
    const statusNameById = new Map((statuses || []).map((status) => [status.id, status.name]));

    if (type === 'list') {
        const { data: list } = await supabase.from('lists').select('*').eq('id', id).single();
        if (!list) return null;

        const [{ data: space }, { data: sublists }, { data: tasks }] = await Promise.all([
            supabase.from('spaces').select('name').eq('id', list.space_id).single(),
            supabase.from('sublists').select('id, name').eq('list_id', id),
            supabase.from('tasks').select('*').eq('list_id', id),
        ]);

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

        const [{ data: list }, { data: sublists }, { data: listTasks }] = await Promise.all([
            supabase.from('lists').select('*').eq('id', sublist.list_id).single(),
            supabase.from('sublists').select('id, name').eq('list_id', sublist.list_id),
            supabase.from('tasks').select('*').eq('list_id', sublist.list_id),
        ]);
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

        const { data: lists } = await supabase.from('lists').select('id, name').eq('space_id', id);
        const listIds = (lists || []).map((list) => list.id);
        if (listIds.length === 0) return { scopeName: space.name, rows: [] };

        const [{ data: sublists }, { data: tasks }] = await Promise.all([
            supabase.from('sublists').select('id, name').in('list_id', listIds),
            supabase.from('tasks').select('*').in('list_id', listIds),
        ]);

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
