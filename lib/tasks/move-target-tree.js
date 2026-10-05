import { flatToTree } from '@/lib/tasks/task-tree';
import { findDescendantIds } from '@/lib/tasks/task-relations';

/**
 * Counts how many levels sit below a task (0 for a task with no subtasks), using each task's stored depth.
 *
 * @param {object} task - Task whose subtree to measure (uses id and depth)
 * @param {object[]} flatList - Flat array of all tasks in the list
 * @returns {number} Depth of the deepest descendant minus the task's own depth
 */
function getSubtreeHeight(task, flatList) {
    const descendantIds = findDescendantIds(task.id, flatList);
    const descendantDepths = flatList
        .filter((listTask) => descendantIds.has(listTask.id))
        .map((descendant) => descendant.depth);
    return Math.max(task.depth, ...descendantDepths) - task.depth;
}

/**
 * Builds the tree of places a task can be moved under: everything except the task and its own subtree.
 *
 * The direct parent stays in the tree, flagged `isCurrentParent`, so its other children keep their real parent row.
 * Targets that would push the moving subtree past `maxAllowedDepth` are flagged `isTooDeep`.
 *
 * @param {object[]} flatList - Flat array of all tasks in the list
 * @param {object} movingTask - The task being moved (uses id, parent_id and depth)
 * @param {number} [maxAllowedDepth] - Deepest allowed task depth; omit for no limit
 * @returns {object[]} Root nodes with nested `children`, carrying `isCurrentParent` and `isTooDeep` flags
 */
export function buildMoveTargetTree(flatList, movingTask, maxAllowedDepth = Infinity) {
    const subtreeHeight = getSubtreeHeight(movingTask, flatList);
    const excludedIds = findDescendantIds(movingTask.id, flatList);
    excludedIds.add(movingTask.id);

    const targetTasks = flatList
        .filter((task) => !excludedIds.has(task.id))
        .map((task) => ({
            ...task,
            isCurrentParent: task.id === movingTask.parent_id,
            // Same arithmetic as moveTask's server check: the deepest descendant lands at depth + 1 + height.
            isTooDeep: task.depth + 1 + subtreeHeight > maxAllowedDepth,
        }));

    return flatToTree(targetTasks);
}

/**
 * Tells whether the user may pick a node as the move destination.
 *
 * @param {object} node - Node from `buildMoveTargetTree`
 * @returns {boolean} False for the current parent and for targets that would exceed the depth limit
 */
export function isMoveTargetSelectable(node) {
    return !node.isCurrentParent && !node.isTooDeep;
}

/**
 * Tells whether a move-target tree has at least one task the user can actually pick.
 *
 * @param {object[]} nodes - Nodes from `buildMoveTargetTree`
 * @returns {boolean} True if any node in the tree is selectable
 */
export function hasSelectableMoveTarget(nodes) {
    return nodes.some(
        (node) => isMoveTargetSelectable(node) || hasSelectableMoveTarget(node.children),
    );
}

/**
 * Finds the pickable move targets whose title contains the search text, at any depth.
 *
 * Plain substring match, never a RegExp, so characters like "." or "(" in the query stay literal.
 *
 * @param {object[]} roots - Root nodes from `buildMoveTargetTree`
 * @param {string} query - Search text typed by the user
 * @returns {{ id: string, title: string, breadcrumb: string[] }[]} Matches in tree order, with ancestor titles
 */
export function findMatchingMoveTargets(roots, query) {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];

    const matches = [];

    /**
     * Walks the nodes depth-first, recording each pickable title match with its ancestor titles.
     *
     * @param {object[]} nodes - Sibling nodes to check
     * @param {string[]} ancestorTitles - Titles of the nodes above these siblings, outermost first
     */
    function collectMatches(nodes, ancestorTitles) {
        for (const node of nodes) {
            const isMatch = node.title.toLowerCase().includes(normalizedQuery);
            if (isMatch && isMoveTargetSelectable(node)) {
                matches.push({ id: node.id, title: node.title, breadcrumb: ancestorTitles });
            }
            collectMatches(node.children, [...ancestorTitles, node.title]);
        }
    }

    collectMatches(roots, []);
    return matches;
}
