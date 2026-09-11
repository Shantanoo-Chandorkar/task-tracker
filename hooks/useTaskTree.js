'use client';

import { useQuery } from '@tanstack/react-query';
import { flatToTree } from '@/lib/tree';

/**
 * Fetches all tasks and returns both the flat list and the nested tree, cached via TanStack Query.
 *
 * @param {object[]} [initialData] - Initial flat task list from SSR (passed as prop from server component)
 * @returns {{ tree: object[], flatList: object[], isLoading: boolean, error: Error|null }}
 */
export function useTaskTree(initialData) {
    const {
        data: flatList = [],
        isLoading,
        error,
    } = useQuery({
        queryKey: ['tasks'],
        queryFn: async () => {
            const response = await fetch('/api/tasks');
            if (!response.ok) {
                throw new Error('Failed to fetch tasks');
            }
            return response.json();
        },
        initialData,
    });

    const tree = flatToTree(flatList);

    return { tree, flatList, isLoading, error };
}
