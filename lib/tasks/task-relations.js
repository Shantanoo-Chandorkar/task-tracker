/**
 * Walks up the parent_id chain from a given task to the root.
 * Returns ancestors from immediate parent to root (closest first).
 *
 * @param {string} taskId - The task to find ancestors for
 * @param {object[]} flatList - Flat array of all tasks
 * @returns {object[]} Ancestors ordered from immediate parent to root
 */
export function findAncestors(taskId, flatList) {
    const taskById = new Map(flatList.map((task) => [task.id, task]));
    const ancestors = [];
    let current = taskById.get(taskId);

    while (current && current.parent_id) {
        const parent = taskById.get(current.parent_id);
        if (!parent) break;
        ancestors.push(parent);
        current = parent;
    }

    return ancestors;
}

/**
 * Maps every task id to the ids of all its descendants in one pass, instead of rescanning the list per task.
 *
 * @param {object[]} flatList - Flat array of all tasks
 * @returns {Map<string, Set<string>>} Descendant ids per task id; a task with no children maps to an empty set
 */
export function buildDescendantIdsByTaskId(flatList) {
    const childIdsByParentId = new Map();
    for (const task of flatList) {
        if (task.parent_id === null || task.parent_id === undefined) continue;
        const childIds = childIdsByParentId.get(task.parent_id);
        if (childIds) childIds.push(task.id);
        else childIdsByParentId.set(task.parent_id, [task.id]);
    }

    const descendantIdsByTaskId = new Map();
    function collectDescendantIds(taskId) {
        const knownDescendantIds = descendantIdsByTaskId.get(taskId);
        if (knownDescendantIds) return knownDescendantIds;

        const descendantIds = new Set();
        for (const childId of childIdsByParentId.get(taskId) ?? []) {
            descendantIds.add(childId);
            for (const grandchildId of collectDescendantIds(childId))
                descendantIds.add(grandchildId);
        }
        descendantIdsByTaskId.set(taskId, descendantIds);
        return descendantIds;
    }

    for (const task of flatList) collectDescendantIds(task.id);
    return descendantIdsByTaskId;
}

/**
 * Returns a Set of IDs for all descendants of a given task.
 * Used to exclude descendants from valid reparent targets, preventing cycles.
 *
 * @param {string} taskId - The root task to find descendants for
 * @param {object[]} flatList - Flat array of all tasks
 * @returns {Set<string>} Set of descendant task IDs (does not include taskId itself)
 */
export function findDescendantIds(taskId, flatList) {
    const descendantIds = new Set();
    const queue = [taskId];

    while (queue.length > 0) {
        const currentId = queue.shift();
        const children = flatList.filter((task) => task.parent_id === currentId);
        for (const child of children) {
            descendantIds.add(child.id);
            queue.push(child.id);
        }
    }

    return descendantIds;
}

/**
 * Counts a sublist's tasks, including nested subtasks reachable only via their root ancestor's sublist_id.
 *
 * @param {string} sublistId - The sublist to count tasks for
 * @param {object[]} flatList - Flat tasks for the sublist's list, with id, parent_id, sublist_id
 * @returns {number} Total number of tasks (root + all descendants) in the sublist
 */
export function countSublistTasks(sublistId, flatList) {
    const rootTasks = flatList.filter((task) => task.sublist_id === sublistId);
    return rootTasks.reduce(
        (total, rootTask) => total + 1 + findDescendantIds(rootTask.id, flatList).size,
        0,
    );
}

/**
 * Recursively builds a deep clone of a task subtree from the flat list.
 * Returns a plain JS object with a nested `children` array - not linked to DB state.
 * Used as the source snapshot for duplicating a task.
 *
 * @param {string} taskId - The root task of the subtree to clone
 * @param {object[]} flatList - Flat array of all tasks
 * @returns {object|null} Deep clone of the subtree, or null if task not found
 */
export function deepCloneSubtree(taskId, flatList) {
    const task = flatList.find((task) => task.id === taskId);
    if (!task) return null;

    const children = flatList
        .filter((candidate) => candidate.parent_id === taskId)
        .map((child) => deepCloneSubtree(child.id, flatList))
        .filter(Boolean);

    return { ...task, children };
}
