'use client';

import { useQuery } from '@tanstack/react-query';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

/**
 * Shared lists query, kept on a longer staleTime than the global default.
 * Lists change far less often than tasks, so a refetch on every mount would be wasteful.
 *
 * @param {object} [options] - Extra react-query options (e.g. initialData, enabled) merged in
 * @returns {import('@tanstack/react-query').UseQueryResult<object[]>}
 */
export function useListsQuery(options = {}) {
    return useQuery({
        queryKey: ['lists'],
        queryFn: async () => {
            const response = await fetch('/api/lists');
            if (!response.ok) throw new Error('Failed to fetch lists');
            return response.json();
        },
        staleTime: FIVE_MINUTES_MS,
        ...options,
    });
}
