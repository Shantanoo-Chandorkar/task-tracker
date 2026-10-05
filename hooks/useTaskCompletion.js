'use client';

import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useStatusesQuery } from '@/hooks/useStatusesQuery';
import { useSpaceIdForList } from '@/hooks/useSpaceIdForList';
import { findCompletedDescendants, findIncompleteDescendants } from '@/lib/tasks/task-completion';
import {
    completeTaskAndDescendants,
    uncompleteTaskAndDescendants,
} from '@/actions/task-completion-actions';
import { updateTask } from '@/actions/task-update-actions';
import { bustPageCache } from '@/lib/cache/service-worker-cache';
import { claimInFlight } from '@/lib/in-flight-entities';
import { withSavedRow, withStatusDisplay } from '@/lib/cache/query-cache';
import { useConfirmAction } from '@/hooks/useConfirmAction';

/**
 * Single source of truth for marking a task (and its descendants) complete or incomplete.
 * Normalizes checkbox/dropdown/menu-toggle callers into one `setComplete(...)` entry point.
 * Also owns the shared cascade-confirm dialog state, used by both directions.
 *
 * @param {string} listId - The list this completion state applies to (resolves its space's statuses)
 * @returns {{
 *   statuses: object[],
 *   isResolvingStatuses: boolean,
 *   doneStatus: object|undefined,
 *   defaultStatus: object|undefined,
 *   isDone: (task: object) => boolean,
 *   getIncompleteDescendants: (task: object, flatList: object[]) => object[],
 *   getCompletedDescendants: (task: object, flatList: object[]) => object[],
 *   setComplete: (task: object, flatList: object[], listId: string, isComplete: boolean) => Promise<void>,
 *   confirmState: {task: object, listId: string, isComplete: boolean, descendantCount: number}|null,
 *   closeConfirm: () => void,
 *   confirmCascade: () => Promise<boolean>|undefined,
 *   completeDialogProps: object,
 * }}
 */
export function useTaskCompletion(listId) {
    const queryClient = useQueryClient();
    const spaceId = useSpaceIdForList(listId);
    const { data: statuses = [], isLoading: isStatusesLoading } = useStatusesQuery(spaceId);
    const [confirmState, setConfirmState] = useState(null);

    const doneStatus = statuses.find((status) => status.code === 'done');
    const defaultStatus = statuses.find((status) => status.is_default);

    const isDone = useCallback(
        (task) => Boolean(doneStatus) && task.status_id === doneStatus.id,
        [doneStatus],
    );

    const getIncompleteDescendants = useCallback(
        (task, flatList) =>
            doneStatus ? findIncompleteDescendants(task.id, flatList ?? [], doneStatus.id) : [],
        [doneStatus],
    );

    const getCompletedDescendants = useCallback(
        (task, flatList) =>
            doneStatus ? findCompletedDescendants(task.id, flatList ?? [], doneStatus.id) : [],
        [doneStatus],
    );

    const setComplete = useCallback(
        async (task, flatList, listId, isComplete) => {
            if (!doneStatus || !defaultStatus) return;

            const descendants = isComplete
                ? getIncompleteDescendants(task, flatList)
                : getCompletedDescendants(task, flatList);

            if (descendants.length > 0) {
                setConfirmState({ task, listId, isComplete, descendantCount: descendants.length });
                return;
            }

            const releaseInFlight = claimInFlight(`task-complete:${task.id}`);
            if (!releaseInFlight) return;
            const targetStatus = isComplete ? doneStatus : defaultStatus;
            const toastId = toast.loading(
                isComplete ? 'Marking complete...' : 'Marking incomplete...',
            );

            try {
                let saveResult;
                try {
                    saveResult = await updateTask(task.id, { status_id: targetStatus.id });
                } catch {
                    toast.error(
                        'Could not reach the server. Check your connection and try again.',
                        { id: toastId },
                    );
                    return;
                }

                if (saveResult.error) {
                    toast.error(saveResult.error, { id: toastId });
                    return;
                }

                // The checkbox flips as soon as the server confirms; the reload only reconciles in the background.
                if (saveResult.data) {
                    queryClient.setQueryData(['tasks', listId], (cachedTasks) =>
                        withSavedRow(
                            cachedTasks,
                            withStatusDisplay(saveResult.data, statuses),
                            true,
                        ),
                    );
                }
                queryClient.invalidateQueries({ queryKey: ['tasks', listId] });
                bustPageCache({ urls: [`/lists/${listId}`] });
                toast.dismiss(toastId);
            } finally {
                releaseInFlight();
            }
        },
        [
            doneStatus,
            defaultStatus,
            statuses,
            getIncompleteDescendants,
            getCompletedDescendants,
            queryClient,
        ],
    );

    const closeConfirm = useCallback(() => setConfirmState(null), []);

    const cascadeConfirm = useConfirmAction(Boolean(confirmState));

    const confirmCascade = useCallback(() => {
        if (!confirmState) return;
        const { task, listId, isComplete } = confirmState;

        return cascadeConfirm.runConfirmedAction({
            // Same key as the single-task path, so a checkbox click cannot overlap this cascade.
            entityKey: `task-complete:${task.id}`,
            loadingMessage: isComplete ? 'Marking complete...' : 'Marking incomplete...',
            successMessage: (cascadeResult) =>
                // RLS silently skips descendants the caller doesn't own, so surface the real count.
                cascadeResult.completedCount !== undefined &&
                cascadeResult.completedCount < cascadeResult.totalCount
                    ? `${isComplete ? 'Completed' : 'Reopened'} ${cascadeResult.completedCount} of ${cascadeResult.totalCount} tasks - you can only update tasks you created`
                    : isComplete
                      ? 'Marked complete'
                      : 'Marked incomplete',
            action: () =>
                isComplete
                    ? completeTaskAndDescendants(task.id)
                    : uncompleteTaskAndDescendants(task.id),
            // Many rows change, so the popup waits for the reload instead of showing stale statuses.
            onSuccess: async () => {
                await queryClient.invalidateQueries({ queryKey: ['tasks', listId] });
                bustPageCache({ urls: [`/lists/${listId}`] });
            },
            close: () => setConfirmState(null),
        });
    }, [confirmState, cascadeConfirm, queryClient]);

    // Everything CompleteTaskDialog needs, so each consumer renders it with one spread.
    const completeDialogProps = {
        open: Boolean(confirmState),
        onClose: closeConfirm,
        task: confirmState?.task,
        isComplete: confirmState?.isComplete,
        descendantCount: confirmState?.descendantCount ?? 0,
        onConfirm: confirmCascade,
        isPending: cascadeConfirm.isPending,
        errorMessage: cascadeConfirm.errorMessage,
    };

    return {
        statuses,
        // Separates "not resolved yet" from "confirmed no status" to avoid an SSR hydration flash
        isResolvingStatuses: !spaceId || isStatusesLoading,
        doneStatus,
        defaultStatus,
        isDone,
        getIncompleteDescendants,
        getCompletedDescendants,
        setComplete,
        confirmState,
        closeConfirm,
        confirmCascade,
        completeDialogProps,
    };
}
