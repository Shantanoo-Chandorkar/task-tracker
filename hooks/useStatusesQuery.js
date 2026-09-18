'use client';

import { useQuery } from '@tanstack/react-query';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

/**
 * Shared statuses query for one space, kept on a longer staleTime than the global default.
 * Statuses change far less often than tasks, so a refetch on every mount would be wasteful.
 *
 * @param {string|null} spaceId - Space whose statuses to fetch; the query stays disabled until this resolves
 * @param {object} [options] - Extra react-query options (e.g. initialData) merged into the query
 * @returns {import('@tanstack/react-query').UseQueryResult<object[]>}
 */
export function useStatusesQuery(spaceId, options = {}) {
    return useQuery({
        queryKey: ['statuses', spaceId],
        queryFn: async () => {
            const response = await fetch(`/api/statuses?space_id=${spaceId}`);
            if (!response.ok) throw new Error('Failed to fetch statuses');
            return response.json();
        },
        enabled: Boolean(spaceId),
        staleTime: FIVE_MINUTES_MS,
        ...options,
    });
}
