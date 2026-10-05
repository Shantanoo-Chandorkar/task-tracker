'use client';

import { arrayMove } from '@dnd-kit/sortable';
import { updateSublist } from '@/actions/sublist-actions';
import { useReorderRunner } from '@/hooks/useReorderRunner';

/**
 * Reordering of a list's sublists, by drag or by Move up / Move down.
 *
 * @param {string} listId - The list the sublists belong to
 * @param {object[]} sublists - The list's sublists in display order
 * @returns {{
 *   handleSublistDragEnd: (drag: { active: { id: string }, over: { id: string } }) => Promise<void>,
 *   moveSublistNextTo: (sublistId: string, neighbourId: string) => Promise<void>,
 * }} Handlers that save the new order, one update per sublist whose position changed.
 */
export function useSublistReorder(listId, sublists) {
    const runReorder = useReorderRunner(listId);

    async function handleSublistDragEnd({ active, over }) {
        const oldIndex = sublists.findIndex((sublist) => sublist.id === active.id);
        const newIndex = sublists.findIndex((sublist) => sublist.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return;

        const reordered = arrayMove(sublists, oldIndex, newIndex);
        return runReorder({
            scopeKey: 'sublists',
            queryKey: ['sublists', listId],
            applyOptimistic: (queryClient) =>
                queryClient.setQueryData(['sublists', listId], reordered),
            save: async () => {
                const results = await Promise.all(
                    reordered
                        .map((sublist, newPosition) => ({ sublist, newPosition }))
                        .filter(({ sublist, newPosition }) => sublist.position !== newPosition)
                        .map(({ sublist, newPosition }) =>
                            updateSublist(sublist.id, { position: newPosition }),
                        ),
                );
                return results.find((updateOutcome) => updateOutcome.error)?.error ?? null;
            },
            failureMessage: 'Failed to reorder sublist',
        });
    }

    function moveSublistNextTo(sublistId, neighbourId) {
        return handleSublistDragEnd({ active: { id: sublistId }, over: { id: neighbourId } });
    }

    return { handleSublistDragEnd, moveSublistNextTo };
}
