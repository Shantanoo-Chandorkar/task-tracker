'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/fetch-json';

/**
 * Pending join requests for one space, for its owner to review. Only fetch when the caller
 * knows they own the space -- RLS would just return an empty list otherwise.
 *
 * @param {string|null} spaceId
 * @param {object} [options] - Extra react-query options (e.g. enabled) merged in
 * @returns {import('@tanstack/react-query').UseQueryResult<object[]>}
 */
export function useJoinRequestsQuery(spaceId, options = {}) {
    return useQuery({
        queryKey: ['space-collaborators', spaceId, 'pending'],
        queryFn: ({ signal }) =>
            fetchJson(`/api/space-collaborators?space_id=${spaceId}&status=pending`, { signal }),
        enabled: Boolean(spaceId),
        ...options,
    });
}
