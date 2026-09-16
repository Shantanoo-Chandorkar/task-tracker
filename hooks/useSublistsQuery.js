'use client';

import { useQuery } from '@tanstack/react-query';

/**
 * Shared sublists query for one list, kept on the global default staleTime.
 * Sublists mutate too often within a session for a longer staleTime to be safe.
 *
 * @param {string} listId - The list whose sublists to fetch
 * @param {object} [options] - Extra react-query options (e.g. initialData) merged into the query
 * @returns {import('@tanstack/react-query').UseQueryResult<object[]>}
 */
export function useSublistsQuery(listId, options = {}) {
    return useQuery({
        queryKey: ['sublists', listId],
        queryFn: async () => {
            const response = await fetch(`/api/sublists?list_id=${listId}`);
            if (!response.ok) throw new Error('Failed to fetch sublists');
            return response.json();
        },
        ...options,
    });
}
