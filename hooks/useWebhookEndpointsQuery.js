'use client';

import { useQuery } from '@tanstack/react-query';
import { listWebhookEndpoints } from '@/actions/webhook-actions';

/**
 * A space's webhook endpoints. Owner only: the action answers with a code for anyone else.
 *
 * @param {string|null} spaceId - Space whose endpoints to load; the query stays disabled until this resolves.
 * @returns {import('@tanstack/react-query').UseQueryResult<object[]>} Endpoint rows, secrets never included.
 */
export function useWebhookEndpointsQuery(spaceId) {
    return useQuery({
        queryKey: ['webhook-endpoints', spaceId],
        queryFn: async () => {
            const endpointsResult = await listWebhookEndpoints(spaceId);
            if (endpointsResult.error) throw new Error(endpointsResult.error);
            return endpointsResult.data;
        },
        enabled: Boolean(spaceId),
        retry: 1,
    });
}
