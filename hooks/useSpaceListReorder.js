'use client';

import { reorderLists, reorderSpaces } from '@/actions/reorder-actions';
import { UNREACHABLE_TRY_AGAIN_MESSAGE } from '@/lib/ui/unreachable-message';
import { useRowReorder } from '@/hooks/useRowReorder';

const SPACES_PAGE_CACHE = { urls: ['/spaces'] };

/**
 * Reordering of the user's own spaces and of the lists inside one space, by drag or by Move up / Move down.
 *
 * @param {object[]} ownedSpaces - Spaces the user owns, in display order (shared spaces cannot be reordered)
 * @param {object[]} lists - Lists of every space
 * @returns {{
 *   handleDragEnd: (drag: { active: { id: string, data: object }, over: { id: string }|null }) => Promise<void>,
 *   moveSpaceNextTo: (spaceId: string, neighbourId: string) => Promise<void>,
 *   moveListNextTo: (list: object, neighbourId: string) => Promise<void>,
 * }} Handlers that save the new order. A space reorder never touches the lists cache, and the other way round.
 */
export function useSpaceListReorder(ownedSpaces, lists) {
    const reorderRows = useRowReorder();

    function moveSpaceNextTo(spaceId, neighbourId) {
        return reorderRows({
            groupRows: ownedSpaces,
            activeId: spaceId,
            overId: neighbourId,
            queryKey: ['spaces'],
            scopeKey: 'spaces',
            saveOrder: async (reorderedSpaces) =>
                (await reorderSpaces(reorderedSpaces.map((space) => space.id))).error ?? null,
            bustCache: SPACES_PAGE_CACHE,
            failureMessage: UNREACHABLE_TRY_AGAIN_MESSAGE,
            successMessage: 'Order saved',
        });
    }

    function reorderListInSpace(listId, spaceId, neighbourId) {
        return reorderRows({
            groupRows: lists.filter((list) => list.space_id === spaceId),
            activeId: listId,
            overId: neighbourId,
            queryKey: ['lists'],
            scopeKey: `lists:${spaceId}`,
            saveOrder: async (reorderedLists) =>
                (
                    await reorderLists(
                        spaceId,
                        reorderedLists.map((list) => list.id),
                    )
                ).error ?? null,
            bustCache: SPACES_PAGE_CACHE,
            failureMessage: UNREACHABLE_TRY_AGAIN_MESSAGE,
            successMessage: 'Order saved',
        });
    }

    function moveListNextTo(list, neighbourId) {
        return reorderListInSpace(list.id, list.space_id, neighbourId);
    }

    function handleDragEnd({ active, over }) {
        if (!over || active.id === over.id) return;
        const dragType = active.data.current?.type;
        if (dragType === 'space') return moveSpaceNextTo(active.id, over.id);
        if (dragType === 'list') {
            return reorderListInSpace(active.id, active.data.current.spaceId, over.id);
        }
    }

    return { handleDragEnd, moveSpaceNextTo, moveListNextTo };
}
