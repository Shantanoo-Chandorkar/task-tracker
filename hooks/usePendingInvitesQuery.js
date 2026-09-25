'use client';

import { useQuery } from '@tanstack/react-query';

/**
 * Pending (sent, not yet redeemed or revoked) email invites for one space.
 *
 * @param {string|null} spaceId
 * @param {object} [options] - Extra react-query options (e.g. enabled) merged in
 * @returns {import('@tanstack/react-query').UseQueryResult<object[]>}
 */
export function usePendingInvitesQuery(spaceId, options = {}) {
    return useQuery({
        queryKey: ['space-invites', spaceId, 'pending'],
        queryFn: async () => {
            const response = await fetch(`/api/space-invites?space_id=${spaceId}`);
            if (!response.ok) throw new Error('Failed to fetch invites');
            return response.json();
        },
        enabled: Boolean(spaceId),
        ...options,
    });
}
