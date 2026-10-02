'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/fetch-json';

/**
 * Every task of one list, as a flat array. Shared by the list and the task detail page so both use one cache entry.
 *
 * @param {string} listId - List whose tasks to load.
 * @param {object} [options] - Extra react-query options (e.g. initialData) merged in.
 * @returns {import('@tanstack/react-query').UseQueryResult<object[]>} Flat task rows.
 */
export function useTasksQuery(listId, options = {}) {
    return useQuery({
        queryKey: ['tasks', listId],
        queryFn: ({ signal }) => fetchJson(`/api/tasks?list_id=${listId}`, { signal }),
        ...options,
    });
}
