import { arrayMove } from '@dnd-kit/sortable';

/**
 * Works out where a dragged task lands among its siblings, or null when the drop should be ignored.
 *
 * Siblings share a parent and a sublist. A drop onto a task of the other priority tier is ignored, because the
 * star changes tier, not the drag.
 *
 * @param {object[]} flatList - Flat array of all tasks, ordered by depth and position
 * @param {string} activeId - Id of the dragged task
 * @param {string} overId - Id of the task it was dropped on
 * @returns {{ activeTask: object, reorderedSiblingIds: string[], afterSiblingId: string|null,
 *   isMovingToStart: boolean }|null} The new order and the save arguments, or null to do nothing
 */
export function planTaskReorder(flatList, activeId, overId) {
    const activeTask = flatList.find((task) => task.id === activeId);
    if (!activeTask) return null;

    // flatList is ordered by (depth, position), so siblings are already in order without a separate sort
    const siblingIds = flatList
        .filter((task) => isSiblingOf(activeTask, task))
        .map((task) => task.id);
    const overTask = flatList.find((task) => task.id === overId);
    if (Boolean(overTask?.is_prioritised) !== Boolean(activeTask.is_prioritised)) return null;

    const oldIndex = siblingIds.indexOf(activeId);
    const newIndex = siblingIds.indexOf(overId);
    if (oldIndex === -1 || newIndex === -1) return null;

    return {
        activeTask,
        reorderedSiblingIds: arrayMove(siblingIds, oldIndex, newIndex),
        // Downward drags insert after the target; upward drags insert before it (after the prior sibling).
        afterSiblingId: oldIndex < newIndex ? overId : (siblingIds[newIndex - 1] ?? null),
        // afterSiblingId: null already means "append at end", so landing at index 0 needs its own flag
        isMovingToStart: newIndex === 0,
    };
}

/**
 * Tells whether two tasks share a parent and a sublist.
 *
 * @param {object} firstTask - Task to compare (parent_id and sublist_id)
 * @param {object} secondTask - Task to compare against
 * @returns {boolean} True when they are siblings (or the same task)
 */
function isSiblingOf(firstTask, secondTask) {
    return (
        secondTask.parent_id === firstTask.parent_id &&
        (secondTask.sublist_id ?? null) === (firstTask.sublist_id ?? null)
    );
}

/**
 * Rewrites the task list so the siblings of one task appear in a new order, leaving every other task in place.
 *
 * @param {object[]} currentTasks - Flat array of all tasks
 * @param {object} activeTask - A task whose siblings are being reordered (parent_id and sublist_id)
 * @param {string[]} reorderedSiblingIds - Ids of those siblings in their new order
 * @returns {object[]} A new array with the siblings' slots refilled in the new order
 */
export function applyTaskReorder(currentTasks, activeTask, reorderedSiblingIds) {
    const tasksById = new Map(currentTasks.map((task) => [task.id, task]));
    const reorderedSiblings = reorderedSiblingIds.map((taskId) => tasksById.get(taskId));
    let siblingCursor = 0;
    return currentTasks.map((task) =>
        isSiblingOf(activeTask, task) ? reorderedSiblings[siblingCursor++] : task,
    );
}
