'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/fetch-json';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

/**
 * The signed-in caller's habit categories, in their saved order.
 *
 * @param {object} [options] - Extra react-query options (e.g. initialData) merged into the query.
 * @returns {import('@tanstack/react-query').UseQueryResult<object[]>}
 */
export function useHabitCategoriesQuery(options = {}) {
    return useQuery({
        queryKey: ['habit-categories'],
        queryFn: ({ signal }) => fetchJson('/api/habit-categories', { signal }),
        staleTime: FIVE_MINUTES_MS,
        ...options,
    });
}
