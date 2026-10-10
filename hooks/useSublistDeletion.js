'use client';

import { useQueryClient } from '@tanstack/react-query';
import { deleteSublist } from '@/actions/sublist-actions';
import { bustPageCache } from '@/lib/cache/service-worker-cache';
import { countSublistTasks } from '@/lib/tasks/task-relations';
import { useConfirmAction } from '@/hooks/useConfirmAction';
import { useDeleteConfirm } from '@/hooks/useDeleteConfirm';

/**
 * State and actions behind the "Delete sublist" confirmation popup.
 *
 * @param {string} listId - The list the sublist belongs to
 * @param {object[]} flatList - Flat array of all tasks in the list, used for the task count the popup shows
 * @returns {{
 *   deleteTarget: object|null,
 *   closeDelete: () => void,
 *   requestDelete: (sublist: object) => void,
 *   confirmDelete: () => Promise<boolean>|undefined,
 *   isPending: boolean,
 *   errorMessage: string,
 * }} `requestDelete` opens the popup at once; `confirmDelete` runs the delete and closes it when finished.
 */
export function useSublistDeletion(listId, flatList) {
    const queryClient = useQueryClient();
    const { deleteTarget, setDeleteTarget, requestDelete: openDeleteConfirm } = useDeleteConfirm();
    const { isPending, errorMessage, runConfirmedAction } = useConfirmAction(Boolean(deleteTarget));

    function requestDelete(sublist) {
        openDeleteConfirm(
            {
                id: sublist.id,
                name: sublist.name,
                // Counted from the loaded tasks, since the sublist's own task_count skips nested subtasks.
                taskCount: countSublistTasks(sublist.id, flatList),
            },
            {
                countsUrl: `/api/sublists/${sublist.id}`,
                withFreshCounts: (openTarget, fetched) => ({
                    ...openTarget,
                    taskCount: fetched.task_count,
                }),
            },
        );
    }

    function confirmDelete() {
        if (!deleteTarget) return;
        const sublistId = deleteTarget.id;

        return runConfirmedAction({
            entityKey: `sublist-delete:${sublistId}`,
            loadingMessage: 'Deleting sublist...',
            successMessage: 'Sublist deleted',
            action: () => deleteSublist(sublistId),
            // Its tasks go with it, so the popup waits for both reloads instead of showing them regrouped.
            onSuccess: async () => {
                await Promise.all([
                    queryClient.invalidateQueries({ queryKey: ['sublists', listId] }),
                    queryClient.invalidateQueries({ queryKey: ['tasks', listId] }),
                ]);
                // Deleting a sublist cascades to delete all its tasks, changing the list's total count.
                queryClient.invalidateQueries({ queryKey: ['lists'] });
                bustPageCache({ urls: [`/lists/${listId}`] });
            },
            close: () => setDeleteTarget(null),
        });
    }

    return {
        deleteTarget,
        closeDelete: () => setDeleteTarget(null),
        requestDelete,
        confirmDelete,
        isPending,
        errorMessage,
    };
}
