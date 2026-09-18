'use client';

import { useListsQuery } from '@/hooks/useListsQuery';

/**
 * Derives a list's space_id from its id via the already-shared `['lists']` cache, so every
 * status-showing component can resolve its space without re-deriving the same lookup.
 *
 * @param {string|null|undefined} listId - The list whose space is being looked up
 * @returns {string|null} The list's space_id, or null while lists are still loading / listId is unset
 */
export function useSpaceIdForList(listId) {
    const { data: lists = [] } = useListsQuery();
    return lists.find((list) => list.id === listId)?.space_id ?? null;
}
