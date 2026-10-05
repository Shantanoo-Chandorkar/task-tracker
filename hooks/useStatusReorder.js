'use client';

import { reorderStatuses } from '@/actions/reorder-actions';
import { UNREACHABLE_TRY_AGAIN_MESSAGE } from '@/lib/ui/unreachable-message';
import { useRowReorder } from '@/hooks/useRowReorder';

/**
 * Reordering of a space's statuses, by drag or by Move up / Move down.
 *
 * @param {string} spaceId - The space the statuses belong to
 * @param {object[]} statuses - The space's statuses in display order
 * @returns {{
 *   handleDragEnd: (drag: { active: { id: string }, over: { id: string }|null }) => Promise<void>,
 *   moveStatusNextTo: (statusId: string, neighbourId: string) => Promise<void>,
 * }} Handlers that save the new order.
 */
export function useStatusReorder(spaceId, statuses) {
    const reorderRows = useRowReorder();

    function moveStatusNextTo(statusId, neighbourId) {
        return reorderRows({
            groupRows: statuses,
            activeId: statusId,
            overId: neighbourId,
            queryKey: ['statuses', spaceId],
            scopeKey: `statuses:${spaceId}`,
            saveOrder: async (reorderedStatuses) =>
                (
                    await reorderStatuses(
                        spaceId,
                        reorderedStatuses.map((status) => status.id),
                    )
                ).error ?? null,
            // Every list page shows statuses, so every cached list page is stale
            bustCache: { prefixes: ['/lists/'] },
            failureMessage: UNREACHABLE_TRY_AGAIN_MESSAGE,
            successMessage: 'Order saved',
        });
    }

    function handleDragEnd({ active, over }) {
        if (!over || active.id === over.id) return;
        return moveStatusNextTo(active.id, over.id);
    }

    return { handleDragEnd, moveStatusNextTo };
}
