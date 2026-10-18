'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/fetch-json';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

/**
 * The signed-in caller's timer templates, newest first.
 *
 * @param {object} [options] - Extra react-query options (e.g. initialData) merged into the query.
 * @returns {import('@tanstack/react-query').UseQueryResult<object[]>}
 */
export function useTimerTemplatesQuery(options = {}) {
    return useQuery({
        queryKey: ['timer-templates'],
        queryFn: ({ signal }) => fetchJson('/api/timer-templates', { signal }),
        staleTime: FIVE_MINUTES_MS,
        ...options,
    });
}
