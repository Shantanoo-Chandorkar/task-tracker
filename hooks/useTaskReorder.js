'use client';

import { useCallback, useEffect, useRef } from 'react';
import { applyTaskReorder, planTaskReorder } from '@/modules/tasks/domain/task-reorder';
import { useReorderRunner } from '@/hooks/useReorderRunner';

/**
 * Reordering of tasks among their siblings, by Move up / Move down.
 *
 * @param {string} listId - The list the tasks belong to
 * @param {object[]} flatList - Flat array of all tasks in the list, ordered by depth and position
 * @returns {{
 *   onMoveTask: (taskId: string, neighbourId: string) => Promise<void>,
 * }} `onMoveTask` keeps one identity for the life of the list, so memoized rows are not re-rendered by it.
 */
export function useTaskReorder(listId, flatList) {
    const runReorder = useReorderRunner();

    async function moveTaskNextTo(taskId, neighbourId) {
        const reorderPlan = planTaskReorder(flatList, taskId, neighbourId);
        if (!reorderPlan) return;
        const { activeTask, reorderedSiblingIds, afterSiblingId, isMovingToStart } = reorderPlan;

        return runReorder({
            scopeKey: `tasks:${listId}`,
            queryKey: ['tasks', listId],
            // Lands in the new slot at once, without waiting on the save round-trip
            applyOptimistic: (queryClient) =>
                queryClient.setQueryData(['tasks', listId], (current) =>
                    applyTaskReorder(current ?? flatList, activeTask, reorderedSiblingIds),
                ),
            save: async () => {
                const response = await fetch(`/api/tasks/${taskId}/move`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        newParentId: activeTask.parent_id ?? null,
                        sublistId: activeTask.parent_id
                            ? undefined
                            : (activeTask.sublist_id ?? null),
                        afterSiblingId,
                        shouldPrependToStart: isMovingToStart,
                        listId,
                    }),
                });
                return response.ok ? null : 'Failed to reorder task';
            },
            failureMessage: 'Failed to reorder task',
            bustCache: { urls: [`/lists/${listId}`] },
        });
    }

    // A stable wrapper, since a new handler on every list change would re-render every memoized row
    const moveTaskNextToRef = useRef(moveTaskNextTo);
    useEffect(() => {
        moveTaskNextToRef.current = moveTaskNextTo;
    });
    const onMoveTask = useCallback(
        (taskId, neighbourId) => moveTaskNextToRef.current(taskId, neighbourId),
        [],
    );

    return { onMoveTask };
}
