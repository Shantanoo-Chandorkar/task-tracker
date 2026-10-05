import { buildDescendantIdsByTaskId } from '@/lib/tasks/task-relations';
import { taskMatchesFilters } from '@/lib/tasks/task-filters';

/**
 * Counts every task per status, at any depth - a subtask's status can differ from its parent's.
 *
 * @param {object[]} statuses - Statuses with at least an id
 * @param {object[]} flatList - Flat array of all tasks in the list
 * @returns {Object<string, number>} Task count per status id, 0 for a status nothing uses
 */
export function countTasksByStatusId(statuses, flatList) {
    const countsByStatusId = {};
    for (const status of statuses) countsByStatusId[status.id] = 0;
    for (const task of flatList) {
        if (task.status_id in countsByStatusId) countsByStatusId[task.status_id] += 1;
    }
    return countsByStatusId;
}

/**
 * Builds the "N STATUS · N STATUS" summary shown on a sublist header, most populous status first.
 *
 * @param {Map<string, number>} countsByStatusId - Task count per status id, any depth
 * @param {object[]} statuses - Statuses with at least id/name
 * @returns {string} Summary text, empty when the bucket has no status-tagged tasks
 */
export function describeBucketBreakdown(countsByStatusId, statuses) {
    return statuses
        .map((status) => ({ name: status.name, count: countsByStatusId.get(status.id) ?? 0 }))
        .filter((statusCount) => statusCount.count > 0)
        .sort((firstCount, secondCount) => secondCount.count - firstCount.count)
        .map((statusCount) => `${statusCount.count} ${statusCount.name.toUpperCase()}`)
        .join(' · ');
}

/**
 * Groups tasks by status id with one pass; tasks with no status go under the key 'none'.
 *
 * @param {object[]} tasks - Tasks to group
 * @returns {Map<string, object[]>} Tasks per status id
 */
function groupByStatus(tasks) {
    const tasksByStatusId = new Map();
    for (const task of tasks) {
        const key = task.status_id ?? 'none';
        if (!tasksByStatusId.has(key)) tasksByStatusId.set(key, []);
        tasksByStatusId.get(key).push(task);
    }
    return tasksByStatusId;
}

/**
 * Splits root tasks into the main list and one bucket per sublist, each grouped by status with its totals.
 *
 * Built from one pass over the list, not a filter per status. With an active filter, a root task stays when
 * it or any of its descendants matches.
 *
 * @param {object} params
 * @param {object[]} params.rootTasks - Root tasks of the tree, each with its children
 * @param {object[]} params.flatList - Flat array of all tasks in the list
 * @param {object[]} params.sublists - The list's sublists, in display order
 * @param {object} params.filters - Active task filters
 * @param {boolean} params.hasActiveFilters - Whether any filter is on
 * @param {string|null} params.doneStatusId - The space's done status, which "overdue" filtering needs
 * @returns {{ key: string, sublist: object|null, tasks: object[], tasksByStatusId: Map<string, object[]>,
 *   allDepthCount: number, allDepthCountsByStatusId: Map<string, number> }[]} The main list first, then each sublist
 */
export function buildTaskBuckets({
    rootTasks,
    flatList,
    sublists,
    filters,
    hasActiveFilters,
    doneStatusId,
}) {
    // Built once, so each root looks its subtree up instead of rescanning the whole list
    const descendantIdsByTaskId = buildDescendantIdsByTaskId(flatList);
    const tasksById = new Map(flatList.map((task) => [task.id, task]));

    function rootMatchesFilters(rootTask) {
        const context = { doneStatusId };
        if (taskMatchesFilters(rootTask, filters, context)) return true;
        for (const descendantId of descendantIdsByTaskId.get(rootTask.id)) {
            if (taskMatchesFilters(tasksById.get(descendantId), filters, context)) return true;
        }
        return false;
    }

    // Totals include every descendant - a root task's own subtasks belong to its sublist too.
    function countAllDepth(rootTasksInBucket) {
        let total = rootTasksInBucket.length;
        const countsByStatusId = new Map();
        function tally(task) {
            const key = task.status_id ?? 'none';
            countsByStatusId.set(key, (countsByStatusId.get(key) ?? 0) + 1);
        }
        for (const rootTask of rootTasksInBucket) {
            tally(rootTask);
            const descendantIds = descendantIdsByTaskId.get(rootTask.id);
            total += descendantIds.size;
            for (const descendantId of descendantIds) tally(tasksById.get(descendantId));
        }
        return { total, countsByStatusId };
    }

    function buildBucket(key, sublist, bucketRootTasks) {
        const allDepth = countAllDepth(bucketRootTasks);
        return {
            key,
            sublist,
            tasks: bucketRootTasks,
            tasksByStatusId: groupByStatus(bucketRootTasks),
            allDepthCount: allDepth.total,
            allDepthCountsByStatusId: allDepth.countsByStatusId,
        };
    }

    const bucketedRootTasks = hasActiveFilters ? rootTasks.filter(rootMatchesFilters) : rootTasks;
    return [
        buildBucket(
            'direct',
            null,
            bucketedRootTasks.filter((task) => !task.sublist_id),
        ),
        ...sublists.map((sublist) =>
            buildBucket(
                sublist.id,
                sublist,
                bucketedRootTasks.filter((task) => task.sublist_id === sublist.id),
            ),
        ),
    ];
}
