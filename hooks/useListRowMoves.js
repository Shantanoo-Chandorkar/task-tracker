'use client';

import { useTaskReorder } from '@/hooks/useTaskReorder';
import { useSublistReorder } from '@/hooks/useSublistReorder';

/**
 * Everything a task list needs for Move up / Move down: the task and sublist reorder handlers.
 *
 * @param {string} listId - The list being reordered
 * @param {object[]} flatList - Flat array of all tasks in the list
 * @param {object[]} sublists - The list's sublists in display order
 * @returns {{
 *   onMoveTask: (taskId: string, neighbourId: string) => Promise<void>,
 *   onMoveSublist: (sublistId: string, neighbourId: string) => Promise<void>,
 * }} Move up / Move down handlers for rows and sublist headers.
 */
export function useListRowMoves(listId, flatList, sublists) {
    const { onMoveTask } = useTaskReorder(listId, flatList);
    const { moveSublistNextTo } = useSublistReorder(listId, sublists);

    return { onMoveTask, onMoveSublist: moveSublistNextTo };
}
