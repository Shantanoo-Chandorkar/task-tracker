'use client';

import { UNREACHABLE_TRY_AGAIN_MESSAGE } from '@/lib/ui/unreachable-message';
import { useRowReorder } from '@/hooks/useRowReorder';

/**
 * Reordering of a space's labels (statuses or tags), by drag or by Move up / Move down.
 *
 * @param {object} config
 * @param {string} config.resourceKey - Cache key of the label list, e.g. 'statuses'
 * @param {string} config.spaceId - The space the labels belong to
 * @param {object[]} config.labels - The space's labels in display order
 * @param {(spaceId: string, orderedLabelIds: string[]) => Promise<{ error: string|null }>} config.saveOrder - Server
 *   action that stores the new order
 * @returns {{
 *   handleDragEnd: (drag: { active: { id: string }, over: { id: string }|null }) => Promise<void>,
 *   moveLabelNextTo: (labelId: string, neighbourId: string) => Promise<void>,
 * }} Handlers that save the new order.
 */
export function useLabelReorder({ resourceKey, spaceId, labels, saveOrder }) {
    const reorderRows = useRowReorder();

    function moveLabelNextTo(labelId, neighbourId) {
        return reorderRows({
            groupRows: labels,
            activeId: labelId,
            overId: neighbourId,
            queryKey: [resourceKey, spaceId],
            scopeKey: `${resourceKey}:${spaceId}`,
            saveOrder: async (reorderedLabels) =>
                (
                    await saveOrder(
                        spaceId,
                        reorderedLabels.map((label) => label.id),
                    )
                ).error ?? null,
            // Every list page shows statuses and tags, so every cached list page is stale
            bustCache: { prefixes: ['/lists/'] },
            failureMessage: UNREACHABLE_TRY_AGAIN_MESSAGE,
            successMessage: 'Order saved',
        });
    }

    function handleDragEnd({ active, over }) {
        if (!over || active.id === over.id) return;
        return moveLabelNextTo(active.id, over.id);
    }

    return { handleDragEnd, moveLabelNextTo };
}
