'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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

/**
 * A stable getter for the list's tasks right now, so rows need no list prop that changes on every edit.
 *
 * @param {string} listId - List whose tasks to read.
 * @returns {() => object[]} Returns the cached flat task rows, or an empty array before they load.
 */
export function useGetTasks(listId) {
    const queryClient = useQueryClient();
    return useCallback(
        () => queryClient.getQueryData(['tasks', listId]) ?? [],
        [queryClient, listId],
    );
}
