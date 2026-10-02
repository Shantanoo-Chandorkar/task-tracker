'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/fetch-json';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

/**
 * Shared spaces query, kept on a longer staleTime than the global default.
 * Spaces change far less often than tasks, so a refetch on every mount would be wasteful.
 *
 * @param {object} [options] - Extra react-query options (e.g. initialData, enabled) merged in
 * @returns {import('@tanstack/react-query').UseQueryResult<object[]>}
 */
export function useSpacesQuery(options = {}) {
    return useQuery({
        queryKey: ['spaces'],
        queryFn: ({ signal }) => fetchJson('/api/spaces', { signal }),
        staleTime: FIVE_MINUTES_MS,
        ...options,
    });
}
