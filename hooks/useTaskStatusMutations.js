'use client';

import { useQueryClient } from '@tanstack/react-query';
import { enqueueOrRun } from '@/lib/offline-queue';
import { findDescendantIds } from '@/lib/tree';

/**
 * Shared optimistic status-change logic for the three places a task's status can be
 * changed (row menu, subtask checkbox, status dropdown) — each applies the same
 * snapshot/patch/rollback pattern around the offline outbox, so it lives here once.
 *
 * @param {string} listId - The list whose cached task data should be patched
 * @returns {{
 *   updateStatus: (taskId: string, statusId: string) => Promise<{ error: string|null, queued?: boolean }>,
 *   completeWithCascade: (taskId: string, doneStatusId: string, flatList: object[]) => Promise<{ error: string|null, queued?: boolean }>,
 * }}
 */
export function useTaskStatusMutations(listId) {
    const queryClient = useQueryClient();
    const queryKey = ['tasks', listId];

    /**
     * Sets a single task's status, optimistically and through the offline outbox.
     *
     * @param {string} taskId - Task to update
     * @param {string} statusId - New status id
     * @returns {{ error: string|null, queued?: boolean }}
     */
    async function updateStatus(taskId, statusId) {
        const previousTasks = queryClient.getQueryData(queryKey);
        queryClient.setQueryData(queryKey, (current) =>
            current?.map((task) => (task.id === taskId ? { ...task, status_id: statusId } : task)),
        );

        const result = await enqueueOrRun('updateTask', { taskId, fields: { status_id: statusId } });
        if (result.error) queryClient.setQueryData(queryKey, previousTasks);
        return result;
    }

    /**
     * Marks a task and all its descendants done, optimistically and through the offline outbox.
     *
     * @param {string} taskId - Root task to complete along with its descendants
     * @param {string} doneStatusId - The "done" status id
     * @param {object[]} flatList - Full flat task list, used to find descendants
     * @returns {{ error: string|null, queued?: boolean }}
     */
    async function completeWithCascade(taskId, doneStatusId, flatList) {
        const previousTasks = queryClient.getQueryData(queryKey);
        const idsToComplete = new Set([taskId, ...findDescendantIds(taskId, flatList)]);
        queryClient.setQueryData(queryKey, (current) =>
            current?.map((task) =>
                idsToComplete.has(task.id) ? { ...task, status_id: doneStatusId } : task,
            ),
        );

        const result = await enqueueOrRun('completeTaskAndDescendants', { taskId });
        if (result.error) queryClient.setQueryData(queryKey, previousTasks);
        return result;
    }

    return { updateStatus, completeWithCascade };
}
