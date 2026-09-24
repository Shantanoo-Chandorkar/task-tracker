/**
 * Moves prioritised tasks ahead of unprioritised ones, keeping each group's existing order.
 *
 * @param {object[]} tasks - Sibling tasks already in position order
 * @returns {object[]} New array with prioritised tasks first
 */
function sortPrioritisedTasksFirst(tasks) {
    return [
        ...tasks.filter((task) => task.is_prioritised),
        ...tasks.filter((task) => !task.is_prioritised),
    ];
}

/**
 * Tells the UI where to draw the divider between the prioritised and unprioritised tiers.
 *
 * @param {object[]} siblings - Sibling tasks in display order (prioritised first)
 * @param {number} siblingIndex - Position of the sibling about to be rendered
 * @returns {boolean} True when this is the first unprioritised sibling and a prioritised one precedes it
 */
export function isStartOfUnprioritisedTier(siblings, siblingIndex) {
    const previousSibling = siblings[siblingIndex - 1];
    return Boolean(previousSibling?.is_prioritised) && !siblings[siblingIndex].is_prioritised;
}

/**
 * Converts the flat task array returned by the Supabase query into a nested tree.
 * Uses an O(n) Map-based algorithm - no nested loops.
 * Sibling groups come out prioritised-first, so a prioritised parent carries its subtree.
 *
 * @param {object[]} flatList - Flat array of tasks with id and parent_id fields
 * @returns {object[]} Nested array of root tasks, each with a populated `children` array
 */
export function flatToTree(flatList) {
    const map = new Map();
    const roots = [];

    // First pass: build a map of all nodes with empty children arrays
    for (const task of flatList) {
        map.set(task.id, { ...task, children: [] });
    }

    // Second pass: assign each node to its parent's children, or to roots
    for (const task of flatList) {
        const node = map.get(task.id);
        if (task.parent_id === null || task.parent_id === undefined) {
            roots.push(node);
        } else {
            const parent = map.get(task.parent_id);
            if (parent) {
                parent.children.push(node);
            } else {
                // Parent not found - treat as root to avoid orphaned nodes disappearing
                roots.push(node);
            }
        }
    }

    for (const taskNode of map.values()) {
        taskNode.children = sortPrioritisedTasksFirst(taskNode.children);
    }

    return sortPrioritisedTasksFirst(roots);
}

/**
 * Flattens the task tree depth-first, so each task is immediately followed by its own descendants.
 *
 * Overwrites `depth` with each task's real position in this walk, not the persisted DB column.
 *
 * @param {object[]} flatList - Flat array of tasks with id and parent_id fields
 * @returns {object[]} Tasks in depth-first, parent-before-children order, with `depth` corrected
 */
export function flattenTreeDepthFirst(flatList) {
    const orderedTasks = [];

    function walk(nodes, depth) {
        for (const node of nodes) {
            orderedTasks.push({ ...node, depth });
            walk(node.children, depth + 1);
        }
    }

    walk(flatToTree(flatList), 0);
    return orderedTasks;
}

/**
 * Walks up the parent_id chain from a given task to the root.
 * Returns ancestors from immediate parent to root (closest first).
 *
 * @param {string} taskId - The task to find ancestors for
 * @param {object[]} flatList - Flat array of all tasks
 * @returns {object[]} Ancestors ordered from immediate parent to root
 */
export function findAncestors(taskId, flatList) {
    const map = new Map(flatList.map((t) => [t.id, t]));
    const ancestors = [];
    let current = map.get(taskId);

    while (current && current.parent_id) {
        const parent = map.get(current.parent_id);
        if (!parent) break;
        ancestors.push(parent);
        current = parent;
    }

    return ancestors;
}

/**
 * Computes the depth updates needed for a task and all its descendants
 * when that task is moved to a new depth.
 *
 * @param {string} taskId - Root of the subtree being moved
 * @param {number} newDepth - The new depth for the root of the subtree
 * @param {object[]} flatList - Flat array of all tasks
 * @returns {{ id: string, depth: number }[]} List of id/depth updates to apply
 */
export function recomputeDepth(taskId, newDepth, flatList) {
    const task = flatList.find((t) => t.id === taskId);
    if (!task) return [];

    const depthDelta = newDepth - task.depth;
    const updates = [];
    const queue = [taskId];

    while (queue.length > 0) {
        const currentId = queue.shift();
        const current = flatList.find((t) => t.id === currentId);
        if (!current) continue;

        updates.push({ id: current.id, depth: current.depth + depthDelta });

        const children = flatList.filter((t) => t.parent_id === currentId);
        for (const child of children) {
            queue.push(child.id);
        }
    }

    return updates;
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
    const ids = new Set();
    const queue = [taskId];

    while (queue.length > 0) {
        const currentId = queue.shift();
        const children = flatList.filter((t) => t.parent_id === currentId);
        for (const child of children) {
            ids.add(child.id);
            queue.push(child.id);
        }
    }

    return ids;
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
 * Returns descendant tasks (any depth) of a task that are not yet in the given done status.
 *
 * @param {string} taskId - Root task to check
 * @param {object[]} flatList - Flat array of all tasks
 * @param {string} doneStatusId - The id of the "done" status
 * @returns {object[]} Descendant tasks still not done
 */
export function findIncompleteDescendants(taskId, flatList, doneStatusId) {
    const descendantIds = findDescendantIds(taskId, flatList);
    return flatList.filter((task) => descendantIds.has(task.id) && task.status_id !== doneStatusId);
}

/**
 * Returns descendant tasks (any depth) of a task that are currently in the given done status.
 * The inverse of `findIncompleteDescendants` - used to preview/perform an uncomplete cascade.
 *
 * @param {string} taskId - Root task to check
 * @param {object[]} flatList - Flat array of all tasks
 * @param {string} doneStatusId - The id of the "done" status
 * @returns {object[]} Descendant tasks currently done
 */
export function findCompletedDescendants(taskId, flatList, doneStatusId) {
    const descendantIds = findDescendantIds(taskId, flatList);
    return flatList.filter((task) => descendantIds.has(task.id) && task.status_id === doneStatusId);
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
    const task = flatList.find((t) => t.id === taskId);
    if (!task) return null;

    const children = flatList
        .filter((t) => t.parent_id === taskId)
        .map((child) => deepCloneSubtree(child.id, flatList))
        .filter(Boolean);

    return { ...task, children };
}
