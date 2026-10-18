'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/fetch-json';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

/**
 * The signed-in caller's habits, in saved order - personal (decision 6), so no scoping id like useTasksQuery needs.
 *
 * @param {object} [options] - Extra react-query options (e.g. initialData) merged into the query.
 * @returns {import('@tanstack/react-query').UseQueryResult<object[]>}
 */
export function useHabitsQuery(options = {}) {
    return useQuery({
        queryKey: ['habits'],
        queryFn: ({ signal }) => fetchJson('/api/habits', { signal }),
        staleTime: FIVE_MINUTES_MS,
        ...options,
    });
}
