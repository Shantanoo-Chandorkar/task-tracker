'use client';

import { useQueryClient } from '@tanstack/react-query';
import { deleteSpace } from '@/actions/space-actions';
import { deleteList } from '@/actions/list-actions';
import { leaveSpace } from '@/actions/collaboration-actions';
import { bustPageCache } from '@/lib/cache/service-worker-cache';
import { removeRowFromCache } from '@/lib/cache/query-cache';
import { countSpaceContents } from '@/lib/cache/cached-delete-counts';
import { getDeleteToasts } from '@/lib/spaces/delete-target-copy';
import { useConfirmAction } from '@/hooks/useConfirmAction';
import { useDeleteConfirm } from '@/hooks/useDeleteConfirm';

/**
 * The confirm popup state and the work behind deleting a space, deleting a list, and leaving a shared space.
 *
 * @param {object[]} lists - Lists of every space, from the cache, to count what a space delete would remove
 * @returns {{
 *   deleteTarget: { type: 'space'|'list'|'leave-space', id: string, name: string, counts: object|null }|null,
 *   requestDeleteSpace: (space: object) => void,
 *   requestDeleteList: (list: object) => void,
 *   requestLeaveSpace: (space: object) => void,
 *   closeDelete: () => void,
 *   confirmDelete: () => Promise<boolean>|undefined,
 *   isPending: boolean,
 *   errorMessage: string,
 * }} The popup opens at once from cached counts; `confirmDelete` closes it only when the screen is already final.
 */
export function useSpaceListDeletion(lists) {
    const queryClient = useQueryClient();
    const { deleteTarget, setDeleteTarget, requestDelete } = useDeleteConfirm();
    const deleteConfirm = useConfirmAction(Boolean(deleteTarget));

    async function refetchSpacesAndLists() {
        await queryClient.invalidateQueries({ queryKey: ['spaces'] });
        await queryClient.invalidateQueries({ queryKey: ['lists'] });
        bustPageCache({ urls: ['/spaces'] });
    }

    function requestDeleteSpace(space) {
        requestDelete(
            {
                type: 'space',
                id: space.id,
                name: space.name,
                counts: countSpaceContents(space.id, lists),
            },
            {
                countsUrl: `/api/spaces/${space.id}`,
                withFreshCounts: (openTarget, fetched) => ({
                    ...openTarget,
                    counts: { lists: fetched.list_count, tasks: fetched.task_count },
                }),
            },
        );
    }

    function requestDeleteList(list) {
        requestDelete(
            { type: 'list', id: list.id, name: list.name, counts: { tasks: list.task_count ?? 0 } },
            {
                countsUrl: `/api/lists/${list.id}`,
                withFreshCounts: (openTarget, fetched) => ({
                    ...openTarget,
                    counts: { tasks: fetched.task_count },
                }),
            },
        );
    }

    function requestLeaveSpace(space) {
        setDeleteTarget({ type: 'leave-space', id: space.id, name: space.name, counts: null });
    }

    function closeDelete() {
        setDeleteTarget(null);
    }

    function runDeleteAction({ type, id }) {
        if (type === 'space') return deleteSpace(id);
        if (type === 'list') return deleteList(id);
        return leaveSpace({ spaceId: id });
    }

    function removeDeletedRowsFromCache({ type, id }) {
        if (type === 'list') bustPageCache({ urls: [`/lists/${id}`] });
        else bustPageCache({ prefixes: ['/lists/'] });
        removeRowFromCache(queryClient, type === 'list' ? ['lists'] : ['spaces'], id);
        if (type !== 'list') {
            queryClient.setQueryData(['lists'], (cachedLists) =>
                cachedLists?.filter((list) => list.space_id !== id),
            );
        }
    }

    function confirmDelete() {
        if (!deleteTarget) return;
        const toastCopy = getDeleteToasts(deleteTarget.type);

        return deleteConfirm.runConfirmedAction({
            entityKey: `${deleteTarget.type}-delete:${deleteTarget.id}`,
            loadingMessage: toastCopy.loading,
            successMessage: toastCopy.done,
            action: () => runDeleteAction(deleteTarget),
            // The row leaves the lists at once, so the popup closes onto the final screen; the reload is quiet.
            onSuccess: () => {
                removeDeletedRowsFromCache(deleteTarget);
                refetchSpacesAndLists();
            },
            close: closeDelete,
        });
    }

    return {
        deleteTarget,
        requestDeleteSpace,
        requestDeleteList,
        requestLeaveSpace,
        closeDelete,
        confirmDelete,
        isPending: deleteConfirm.isPending,
        errorMessage: deleteConfirm.errorMessage,
    };
}
