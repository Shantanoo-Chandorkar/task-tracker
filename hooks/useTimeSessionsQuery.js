'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/fetch-json';

const THIRTY_SECONDS_MS = 30 * 1000;
const ONE_MINUTE_MS = 60 * 1000;

/**
 * The signed-in caller's own time sessions, live and recently completed - personal like habits.
 * Refetches every minute, since cross-device resume depends on picking up another device's change.
 *
 * @param {object} [options] - Extra react-query options (e.g. initialData) merged into the query.
 * @returns {import('@tanstack/react-query').UseQueryResult<object[]>}
 */
export function useTimeSessionsQuery(options = {}) {
    return useQuery({
        queryKey: ['time-sessions'],
        queryFn: ({ signal }) => fetchJson('/api/time-sessions', { signal }),
        staleTime: THIRTY_SECONDS_MS,
        refetchInterval: ONE_MINUTE_MS,
        ...options,
    });
}
