'use client';

import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useStatusesQuery } from '@/hooks/useStatusesQuery';
import { useSpaceIdForList } from '@/hooks/useSpaceIdForList';
import { findCompletedDescendants, findIncompleteDescendants } from '@/lib/tree';
import { updateTask, completeTaskAndDescendants, uncompleteTaskAndDescendants } from '@/actions/task-actions';
import { bustPageCache } from '@/lib/service-worker-cache';

/**
 * Single source of truth for marking a task (and its descendants) complete or incomplete.
 * Normalizes checkbox/dropdown/menu-toggle callers into one `setComplete(...)` entry point.
 * Also owns the shared cascade-confirm dialog state, used by both directions.
 *
 * @param {string} listId - The list this completion state applies to (resolves its space's statuses)
 * @returns {{
 *   doneStatus: object|undefined,
 *   defaultStatus: object|undefined,
 *   isDone: (task: object) => boolean,
 *   getIncompleteDescendants: (task: object, flatList: object[]) => object[],
 *   getCompletedDescendants: (task: object, flatList: object[]) => object[],
 *   setComplete: (task: object, flatList: object[], listId: string, isComplete: boolean) => Promise<void>,
 *   confirmState: {task: object, listId: string, isComplete: boolean, descendantCount: number}|null,
 *   closeConfirm: () => void,
 *   confirmCascade: () => Promise<void>,
 * }}
 */
export function useTaskCompletion(listId) {
    const queryClient = useQueryClient();
    const spaceId = useSpaceIdForList(listId);
    const { data: statuses = [] } = useStatusesQuery(spaceId);
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

    const runCascade = useCallback(
        async (taskId, listId, isComplete) => {
            const toastId = toast.loading(isComplete ? 'Marking complete...' : 'Marking incomplete...');
            const { error } = isComplete
                ? await completeTaskAndDescendants(taskId)
                : await uncompleteTaskAndDescendants(taskId);

            if (error) {
                toast.error(error, { id: toastId });
                return;
            }

            await queryClient.invalidateQueries({ queryKey: ['tasks', listId] });
            bustPageCache({ urls: [`/lists/${listId}`] });
            toast.dismiss(toastId);
        },
        [queryClient],
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

            const targetStatus = isComplete ? doneStatus : defaultStatus;
            const toastId = toast.loading(isComplete ? 'Marking complete...' : 'Marking incomplete...');
            const { error } = await updateTask(task.id, { status_id: targetStatus.id });

            if (error) {
                toast.error(error, { id: toastId });
                return;
            }

            await queryClient.invalidateQueries({ queryKey: ['tasks', listId] });
            bustPageCache({ urls: [`/lists/${listId}`] });
            toast.dismiss(toastId);
        },
        [doneStatus, defaultStatus, getIncompleteDescendants, getCompletedDescendants, queryClient],
    );

    const closeConfirm = useCallback(() => setConfirmState(null), []);

    const confirmCascade = useCallback(async () => {
        if (!confirmState) return;
        const { task, listId, isComplete } = confirmState;
        setConfirmState(null);
        await runCascade(task.id, listId, isComplete);
    }, [confirmState, runCascade]);

    return {
        doneStatus,
        defaultStatus,
        isDone,
        getIncompleteDescendants,
        getCompletedDescendants,
        setComplete,
        confirmState,
        closeConfirm,
        confirmCascade,
    };
}
