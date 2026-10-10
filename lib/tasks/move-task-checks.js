import { findAncestors, findDescendantIds } from '@/lib/tasks/task-relations';

/**
 * Whether making `newParentId` the parent of `taskId` would make the task its own ancestor.
 *
 * @param {string} taskId - Task being moved
 * @param {string} newParentId - Proposed new parent
 * @param {{ id: string, parent_id: string|null }[]} listTaskLinks - Every task of the list
 * @returns {boolean} True when the new parent is the task itself or one of its descendants
 */
export function wouldCreateCycle(taskId, newParentId, listTaskLinks) {
    return newParentId === taskId || findDescendantIds(taskId, listTaskLinks).has(newParentId);
}

/**
 * Whether the deepest task of the moved subtree would land below the maximum depth.
 *
 * @param {object} options
 * @param {{ id: string, depth: number }} options.task - Task being moved
 * @param {number} options.depthDelta - New depth of the task minus its current depth
 * @param {{ id: string, parent_id: string|null, depth: number }[]} options.listTaskLinks - Every task of the list
 * @param {number} options.maxDepth - Deepest allowed depth (0-indexed)
 * @returns {boolean} True when the move would exceed `maxDepth`
 */
export function exceedsMaxDepthAfterMove({ task, depthDelta, listTaskLinks, maxDepth }) {
    const depthByTaskId = new Map(listTaskLinks.map((listTask) => [listTask.id, listTask.depth]));
    const descendantDepths = [...findDescendantIds(task.id, listTaskLinks)].map(
        (descendantId) => depthByTaskId.get(descendantId) ?? task.depth,
    );
    const deepestCurrentDepth = Math.max(task.depth, ...descendantDepths);
    return deepestCurrentDepth + depthDelta > maxDepth;
}

/**
 * Finds the sublist a promoted subtask returns to: the sublist of its root ancestor.
 *
 * @param {string} taskId - Subtask being promoted to the top level
 * @param {{ id: string, parent_id: string|null, sublist_id: string|null }[]} listTaskLinks - Every task of the list
 * @returns {string|null} The root ancestor's sublist id, or null when it has none
 */
export function resolveRootAncestorSublistId(taskId, listTaskLinks) {
    const ancestors = findAncestors(taskId, listTaskLinks);
    const rootAncestor = ancestors[ancestors.length - 1];
    return rootAncestor?.sublist_id ?? null;
}
