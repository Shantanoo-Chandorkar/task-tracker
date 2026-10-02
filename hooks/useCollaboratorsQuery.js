'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/fetch-json';

/**
 * Accepted collaborators for one space.
 *
 * @param {string|null} spaceId
 * @param {object} [options] - Extra react-query options (e.g. enabled) merged in
 * @returns {import('@tanstack/react-query').UseQueryResult<object[]>}
 */
export function useCollaboratorsQuery(spaceId, options = {}) {
    return useQuery({
        queryKey: ['space-collaborators', spaceId, 'accepted'],
        queryFn: ({ signal }) =>
            fetchJson(`/api/space-collaborators?space_id=${spaceId}&status=accepted`, { signal }),
        enabled: Boolean(spaceId),
        ...options,
    });
}
