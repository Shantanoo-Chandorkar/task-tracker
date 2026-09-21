'use client';

import { useQuery } from '@tanstack/react-query';

const THIRTY_SECONDS_MS = 30 * 1000;

/**
 * Home screen summary (priority tasks, recent tasks, lists and sublists).
 * Shorter staleTime than lists because it changes with every task edit.
 *
 * @param {object} [queryOptions]
 * @param {object} [queryOptions.initialData] - Server-rendered summary; its `generated_at` says how old it is.
 * @returns {import('@tanstack/react-query').UseQueryResult<object>}
 */
export function useHomeQuery({ initialData, ...queryOptions } = {}) {
    return useQuery({
        queryKey: ['home'],
        queryFn: async () => {
            const response = await fetch('/api/home');
            if (!response.ok) throw new Error('Failed to fetch home');
            return response.json();
        },
        staleTime: THIRTY_SECONDS_MS,
        initialData,
        // The service worker can serve a days-old page, so the age comes from the data, not from the page load
        initialDataUpdatedAt: initialData ? Date.parse(initialData.generated_at) : undefined,
        ...queryOptions,
    });
}
