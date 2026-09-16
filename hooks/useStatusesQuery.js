'use client';

import { useQuery } from '@tanstack/react-query';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

/**
 * Shared statuses query, kept on a longer staleTime than the global default.
 * Statuses change far less often than tasks, so a refetch on every mount would be wasteful.
 *
 * @param {object} [options] - Extra react-query options (e.g. initialData) merged into the query
 * @returns {import('@tanstack/react-query').UseQueryResult<object[]>}
 */
export function useStatusesQuery(options = {}) {
    return useQuery({
        queryKey: ['statuses'],
        queryFn: async () => {
            const response = await fetch('/api/statuses');
            if (!response.ok) throw new Error('Failed to fetch statuses');
            return response.json();
        },
        staleTime: FIVE_MINUTES_MS,
        ...options,
    });
}
