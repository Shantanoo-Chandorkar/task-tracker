'use client';

import { useQuery } from '@tanstack/react-query';
import { listWebhookDeliveries } from '@/actions/webhook-actions';

const REFRESH_INTERVAL_MS = 5000;

/**
 * Recent deliveries for one endpoint, polled every 5 s so a test event's outcome appears without reloading.
 *
 * @param {string|null} endpointId - Endpoint whose log to load.
 * @returns {import('@tanstack/react-query').UseQueryResult<object[]>} Delivery rows, newest first.
 */
export function useWebhookDeliveriesQuery(endpointId) {
    return useQuery({
        queryKey: ['webhook-deliveries', endpointId],
        queryFn: async () => {
            const deliveriesResult = await listWebhookDeliveries(endpointId);
            if (deliveriesResult.error) throw new Error(deliveriesResult.error);
            return deliveriesResult.data;
        },
        enabled: Boolean(endpointId),
        refetchInterval: REFRESH_INTERVAL_MS,
        retry: 1,
    });
}
