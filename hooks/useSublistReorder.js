'use client';

import { reorderSublists } from '@/actions/reorder-actions';
import { useRowReorder } from '@/hooks/useRowReorder';

/**
 * Reordering of a list's sublists, by drag or by Move up / Move down.
 *
 * @param {string} listId - The list the sublists belong to
 * @param {object[]} sublists - The list's sublists in display order
 * @returns {{
 *   handleSublistDragEnd: (drag: { active: { id: string }, over: { id: string } }) => Promise<void>,
 *   moveSublistNextTo: (sublistId: string, neighbourId: string) => Promise<void>,
 * }} Handlers that save the new order.
 */
export function useSublistReorder(listId, sublists) {
    const reorderRows = useRowReorder();

    function moveSublistNextTo(sublistId, neighbourId) {
        return reorderRows({
            groupRows: sublists,
            activeId: sublistId,
            overId: neighbourId,
            queryKey: ['sublists', listId],
            scopeKey: `sublists:${listId}`,
            saveOrder: async (reorderedSublists) =>
                (
                    await reorderSublists(
                        listId,
                        reorderedSublists.map((sublist) => sublist.id),
                    )
                ).error ?? null,
            bustCache: { urls: [`/lists/${listId}`] },
            failureMessage: 'Failed to reorder sublist',
        });
    }

    function handleSublistDragEnd({ active, over }) {
        return moveSublistNextTo(active.id, over.id);
    }

    return { handleSublistDragEnd, moveSublistNextTo };
}
