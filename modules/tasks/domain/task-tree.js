/**
 * Moves prioritised tasks ahead of unprioritised ones, keeping each group's existing order.
 *
 * @param {Record<string, any>[]} tasks - Sibling tasks already in position order
 * @returns {Record<string, any>[]} New array with prioritised tasks first
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
 * @param {Record<string, any>[]} siblings - Sibling tasks in display order (prioritised first)
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
 * @param {Record<string, any>[]} flatList - Flat array of tasks with id and parent_id fields
 * @returns {Record<string, any>[]} Nested array of root tasks, each with a populated `children` array
 */
export function flatToTree(flatList) {
    const nodeByTaskId = new Map();
    const roots = [];

    for (const task of flatList) {
        nodeByTaskId.set(task.id, { ...task, children: [] });
    }

    for (const task of flatList) {
        const node = nodeByTaskId.get(task.id);
        if (task.parent_id === null || task.parent_id === undefined) {
            roots.push(node);
        } else {
            const parent = nodeByTaskId.get(task.parent_id);
            if (parent) {
                parent.children.push(node);
            } else {
                // Orphans become roots so they never vanish from the screen
                roots.push(node);
            }
        }
    }

    for (const taskNode of nodeByTaskId.values()) {
        taskNode.children = sortPrioritisedTasksFirst(taskNode.children);
    }

    return sortPrioritisedTasksFirst(roots);
}

/**
 * Tells whether two arrays hold the very same items in the same order.
 *
 * @param {any[]} firstItems
 * @param {any[]} secondItems
 * @returns {boolean}
 */
function haveSameItems(firstItems, secondItems) {
    return (
        firstItems.length === secondItems.length &&
        firstItems.every((item, itemIndex) => item === secondItems[itemIndex])
    );
}

/**
 * Tells whether two tree nodes carry the same task data, ignoring `children`.
 *
 * @param {Record<string, any>} firstNode
 * @param {Record<string, any>} secondNode
 * @returns {boolean}
 */
function haveSameTaskFields(firstNode, secondNode) {
    const firstKeys = Object.keys(firstNode).filter((key) => key !== 'children');
    const secondKeys = Object.keys(secondNode).filter((key) => key !== 'children');
    return (
        firstKeys.length === secondKeys.length &&
        firstKeys.every((key) => Object.is(firstNode[key], secondNode[key]))
    );
}

/**
 * Makes a `flatToTree` that reuses the node of every unchanged task, so memoized rows can skip re-rendering.
 *
 * @returns {(flatList: Record<string, any>[]) => Record<string, any>[]} Builds the tree like `flatToTree`, reusing unchanged nodes.
 */
export function createStableTreeBuilder() {
    /** @type {Map<string, Record<string, any>>} */
    let previousNodesById = new Map();
    /** @type {Record<string, any>[]} */
    let previousRoots = [];

    return function buildStableTree(flatList) {
        /** @type {Map<string, Record<string, any>>} */
        const nodesById = new Map();

        /** @param {Record<string, any>} freshNode */
        function reuseUnchanged(freshNode) {
            freshNode.children = freshNode.children.map(reuseUnchanged);
            const previousNode = previousNodesById.get(freshNode.id);
            const stableNode =
                previousNode &&
                haveSameTaskFields(previousNode, freshNode) &&
                haveSameItems(previousNode.children, freshNode.children)
                    ? previousNode
                    : freshNode;
            nodesById.set(stableNode.id, stableNode);
            return stableNode;
        }

        const freshRoots = flatToTree(flatList).map(reuseUnchanged);
        const stableRoots = haveSameItems(previousRoots, freshRoots) ? previousRoots : freshRoots;

        previousNodesById = nodesById;
        previousRoots = stableRoots;
        return stableRoots;
    };
}

/**
 * Makes a reader of row ids that returns the same array while the ids are unchanged, so SortableContext stays put.
 *
 * @returns {(rows: {id: string}[]) => string[]} Gives the rows' ids, reusing the previous array when equal.
 */
export function createStableIdsReader() {
    /** @type {string[]} */
    let previousIds = [];

    return function readStableIds(rows) {
        const rowIds = rows.map((row) => row.id);
        if (!haveSameItems(previousIds, rowIds)) previousIds = rowIds;
        return previousIds;
    };
}
