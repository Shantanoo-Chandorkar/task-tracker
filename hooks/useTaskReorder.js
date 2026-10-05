'use client';

import { useCallback, useEffect, useRef } from 'react';
import { applyTaskReorder, planTaskReorder } from '@/lib/tasks/task-reorder';
import { useReorderRunner } from '@/hooks/useReorderRunner';

/**
 * Reordering of tasks among their siblings, by drag or by Move up / Move down.
 *
 * @param {string} listId - The list the tasks belong to
 * @param {object[]} flatList - Flat array of all tasks in the list, ordered by depth and position
 * @returns {{
 *   handleTaskDragEnd: (drag: { active: { id: string }, over: { id: string } }) => Promise<void>,
 *   onMoveTask: (taskId: string, neighbourId: string) => Promise<void>,
 * }} `onMoveTask` keeps one identity for the life of the list, so memoized rows are not re-rendered by it.
 */
export function useTaskReorder(listId, flatList) {
    const runReorder = useReorderRunner(listId);

    async function handleTaskDragEnd({ active, over }) {
        const reorderPlan = planTaskReorder(flatList, active.id, over.id);
        if (!reorderPlan) return;
        const { activeTask, reorderedSiblingIds, afterSiblingId, isMovingToStart } = reorderPlan;

        return runReorder({
            scopeKey: 'tasks',
            queryKey: ['tasks', listId],
            // Lands in the new slot at once, without waiting on the save round-trip
            applyOptimistic: (queryClient) =>
                queryClient.setQueryData(['tasks', listId], (current) =>
                    applyTaskReorder(current ?? flatList, activeTask, reorderedSiblingIds),
                ),
            save: async () => {
                const response = await fetch(`/api/tasks/${active.id}/move`, {
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
        });
    }

    /** Move up / Move down: the same save path as a drag, so the same guards and the same optimistic update apply. */
    function moveTaskNextTo(taskId, neighbourId) {
        return handleTaskDragEnd({ active: { id: taskId }, over: { id: neighbourId } });
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

    return { handleTaskDragEnd, onMoveTask };
}
