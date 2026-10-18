'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/fetch-json';
import { addDaysToLocalDate } from '@/modules/habits/domain/local-date';

const FIVE_MINUTES_MS = 5 * 60 * 1000;
// Bounds the row count for long-time users - a deliberate scope choice, not pagination the app lacks.
const LOOKBACK_DAYS = 400;

/**
 * The signed-in caller's own check-ins from a bounded lookback window onward.
 *
 * @param {string} todayLocalDate - 'YYYY-MM-DD', the caller's current local date.
 * @param {object} [options] - Extra react-query options (e.g. initialData) merged into the query.
 * @returns {import('@tanstack/react-query').UseQueryResult<object[]>}
 */
export function useHabitEntriesQuery(todayLocalDate, options = {}) {
    const since = addDaysToLocalDate(todayLocalDate, -LOOKBACK_DAYS);
    return useQuery({
        queryKey: ['habit-entries'],
        queryFn: ({ signal }) => fetchJson(`/api/habit-entries?since=${since}`, { signal }),
        staleTime: FIVE_MINUTES_MS,
        ...options,
    });
}
