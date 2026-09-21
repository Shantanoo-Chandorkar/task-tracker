'use client';

import { useQuery } from '@tanstack/react-query';

const TEN_MINUTES_MS = 10 * 60 * 1000;

/**
 * Current user's display name and email; long staleTime because the name rarely changes.
 *
 * @param {object} [extraQueryOptions] - Extra react-query options (e.g. initialData, enabled) merged in.
 * @returns {import('@tanstack/react-query').UseQueryResult<{ display_name: string|null, email: string }>} Profile query.
 */
export function useCurrentUserProfileQuery(extraQueryOptions = {}) {
    return useQuery({
        queryKey: ['profile'],
        queryFn: async () => {
            const response = await fetch('/api/profile');
            if (!response.ok) throw new Error('Failed to fetch profile');
            return response.json();
        },
        staleTime: TEN_MINUTES_MS,
        ...extraQueryOptions,
    });
}
