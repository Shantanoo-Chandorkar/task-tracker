'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNowStrict } from 'date-fns';
import { toast } from 'sonner';
import { runExclusively } from '@/lib/in-flight-entities';
import { retryWebhookDelivery } from '@/actions/webhook-actions';
import { useWebhookDeliveriesQuery } from '@/hooks/useWebhookDeliveriesQuery';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/custom/Loader';
import { describeDelivery, describeEventType } from '@/lib/webhooks/webhook-display';

const BADGE_VARIANT_BY_TONE = { good: 'secondary', pending: 'outline', bad: 'destructive' };

/**
 * Says when something happened or will happen, relative to now.
 *
 * @param {string|null} isoTime - Timestamp from the delivery row
 * @returns {string|null} e.g. '5 seconds ago' or 'in 2 minutes'; null when there is no time
 */
function formatRelativeTime(isoTime) {
    return isoTime ? formatDistanceToNowStrict(new Date(isoTime), { addSuffix: true }) : null;
}

/**
 * One delivery in the log: what was sent, how it went, and a retry button when it failed for good.
 *
 * @param {object} props
 * @param {object} props.delivery - Delivery row with its embedded event
 * @param {Function} props.onRetry - Called with the delivery id
 * @param {boolean} props.isRetrying - Whether a retry for this row is in flight
 */
function DeliveryRow({ delivery, onRetry, isRetrying }) {
    const deliveryStatus = describeDelivery(delivery);
    const timeText =
        delivery.status === 'retrying'
            ? `next try ${formatRelativeTime(delivery.next_attempt_at)}`
            : formatRelativeTime(
                  delivery.delivered_at ?? delivery.last_attempt_at ?? delivery.created_at,
              );

    return (
        <li className="flex flex-col gap-1 border-b border-border px-3 py-2.5 last:border-b-0">
            <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-foreground">
                    {describeEventType(delivery.webhook_events?.event_type)}
                </span>
                <Badge variant={BADGE_VARIANT_BY_TONE[deliveryStatus.tone]}>
                    {deliveryStatus.label}
                </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
                {[
                    deliveryStatus.reason,
                    delivery.attempt_count > 0 && `${delivery.attempt_count} tries`,
                    timeText,
                ]
                    .filter(Boolean)
                    .join(' · ')}
            </p>
            {delivery.status === 'failed' && (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 w-fit gap-1.5"
                    disabled={isRetrying}
                    onClick={() => onRetry(delivery.id)}
                >
                    {isRetrying && <Loader size="xs" />}
                    Retry
                </Button>
            )}
        </li>
    );
}

/**
 * Recent deliveries for one endpoint, refreshed automatically while it is on screen.
 *
 * @param {object} props
 * @param {string} props.endpointId - Endpoint whose log to show
 */
export default function WebhookDeliveryLog({ endpointId }) {
    const queryClient = useQueryClient();
    const [retryingDeliveryIds, setRetryingDeliveryIds] = useState(() => new Set());
    const { data: deliveries = [], isLoading, isError } = useWebhookDeliveriesQuery(endpointId);

    function handleRetry(deliveryId) {
        return runExclusively(`webhook-retry:${deliveryId}`, async () => {
            setRetryingDeliveryIds((current) => new Set(current).add(deliveryId));
            try {
                const retryResult = await retryWebhookDelivery(deliveryId);
                if (retryResult.error) {
                    toast.error(retryResult.error);
                    return;
                }
                toast.success('Queued for another try');
                await queryClient.invalidateQueries({
                    queryKey: ['webhook-deliveries', endpointId],
                });
            } catch {
                toast.error('Could not reach the server. Try again.');
            } finally {
                setRetryingDeliveryIds((current) => {
                    const remaining = new Set(current);
                    remaining.delete(deliveryId);
                    return remaining;
                });
            }
        });
    }

    if (isLoading)
        return (
            <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader size="sm" />
                Loading deliveries...
            </div>
        );

    if (isError)
        return (
            <p className="py-3 text-center text-sm text-destructive">Could not load deliveries.</p>
        );

    if (deliveries.length === 0)
        return (
            <p className="py-3 text-center text-sm text-muted-foreground">
                No deliveries yet. Send a test event to try it.
            </p>
        );

    return (
        <ul className="rounded-xl bg-card" aria-label="Recent deliveries">
            {deliveries.map((delivery) => (
                <DeliveryRow
                    key={delivery.id}
                    delivery={delivery}
                    onRetry={handleRetry}
                    isRetrying={retryingDeliveryIds.has(delivery.id)}
                />
            ))}
        </ul>
    );
}
