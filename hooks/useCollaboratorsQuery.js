'use client';

import { useQuery } from '@tanstack/react-query';

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
        queryFn: async () => {
            const response = await fetch(`/api/space-collaborators?space_id=${spaceId}&status=accepted`);
            if (!response.ok) throw new Error('Failed to fetch collaborators');
            return response.json();
        },
        enabled: Boolean(spaceId),
        ...options,
    });
}
