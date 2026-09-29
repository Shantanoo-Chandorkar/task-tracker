import {
    MAX_DELIVERY_ATTEMPTS,
    TRANSPORT_ERROR_CLASSES,
    decideDeliveryOutcome,
    shouldTripCircuitBreaker,
} from '@/lib/webhooks/delivery-retry-policy';
import { sendWebhookRequest } from '@/lib/webhooks/webhook-http-sender';
import { projectEventForEndpoint } from '@/lib/webhooks/webhook-payload-projection';
import { buildSignedHeaders } from '@/lib/webhooks/webhook-signature';

const CLAIM_BATCH_SIZE = 20;
const CLAIMS_PER_ENDPOINT = 5;
const SWEEP_BUDGET_MS = 45_000;

/**
 * Fetches the signing secrets for one endpoint (current first, previous only while its overlap is valid).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} adminClient - Secret-key client.
 * @param {string} endpointId - Endpoint whose secrets are needed.
 * @returns {Promise<string[]>} One or two secrets.
 * @throws {Error} When the secrets cannot be read.
 */
async function loadSigningSecrets(adminClient, endpointId) {
    const { data: secretRow, error: secretError } = await adminClient
        .rpc('get_webhook_endpoint_secrets', { p_endpoint_id: endpointId })
        .single();
    if (secretError || !secretRow?.current_secret) throw new Error('signing secret unavailable');
    return [secretRow.current_secret, secretRow.previous_secret].filter(Boolean);
}

/**
 * Signs and sends one claimed delivery; any failure becomes an 'unknown' transport failure so it is retried.
 *
 * @param {object} claimedDelivery - A row from `claim_webhook_deliveries`.
 * @param {{ adminClient: object, sendRequest: Function, secretsByEndpointId: Map<string, Promise<string[]>>,
 *   nowMs: number }} sweepContext - Shared dependencies for this sweep.
 * @returns {Promise<{ statusCode: number|null, transportErrorClass: string|null, retryAfterSeconds: number|null }>}
 */
async function attemptDelivery(
    claimedDelivery,
    { adminClient, sendRequest, secretsByEndpointId, nowMs },
) {
    try {
        if (!secretsByEndpointId.has(claimedDelivery.endpoint_id))
            secretsByEndpointId.set(
                claimedDelivery.endpoint_id,
                loadSigningSecrets(adminClient, claimedDelivery.endpoint_id),
            );
        const signingSecrets = await secretsByEndpointId.get(claimedDelivery.endpoint_id);

        const requestBody = JSON.stringify(
            projectEventForEndpoint(
                {
                    id: claimedDelivery.event_id,
                    event_type: claimedDelivery.event_type,
                    schema_version: claimedDelivery.schema_version,
                    occurred_at: claimedDelivery.occurred_at,
                    correlation_id: claimedDelivery.correlation_id,
                    space_id: claimedDelivery.space_id,
                    actor_id: claimedDelivery.actor_id,
                    source: claimedDelivery.source,
                    resource_type: claimedDelivery.resource_type,
                    resource_id: claimedDelivery.resource_id,
                    payload: claimedDelivery.payload,
                },
                claimedDelivery.payload_level,
            ),
        );
        const signatureHeaders = buildSignedHeaders({
            eventId: claimedDelivery.event_id,
            timestampSeconds: Math.floor(nowMs / 1000),
            requestBody,
            signingSecrets,
        });
        return await sendRequest({
            url: claimedDelivery.endpoint_url,
            signatureHeaders,
            requestBody,
        });
    } catch (attemptError) {
        console.error('[webhooks] attempt failed before a response', {
            deliveryId: claimedDelivery.delivery_id,
            endpointId: claimedDelivery.endpoint_id,
            detail: attemptError.message,
        });
        return {
            statusCode: null,
            transportErrorClass: TRANSPORT_ERROR_CLASSES.UNKNOWN,
            retryAfterSeconds: null,
        };
    }
}

/**
 * Processes one claimed delivery end to end and records the outcome.
 *
 * @param {object} claimedDelivery - A row from `claim_webhook_deliveries`.
 * @param {object} sweepContext - Shared dependencies for this sweep, see `attemptDelivery`.
 * @param {() => number} randomFn - Source of jitter in [0, 1).
 * @returns {Promise<'delivered'|'retrying'|'failed'|'lease_lost'|'record_failed'>} What happened to the delivery.
 */
async function processClaimedDelivery(claimedDelivery, sweepContext, randomFn) {
    const attemptResult = await attemptDelivery(claimedDelivery, sweepContext);
    const outcome = decideDeliveryOutcome({
        ...attemptResult,
        attemptsMade: claimedDelivery.attempt_count,
        nowMs: sweepContext.nowMs,
        randomValue: randomFn(),
    });

    let disableReason = null;
    if (outcome.shouldDisableEndpoint) disableReason = 'gone';
    else if (
        outcome.countsAsEndpointFailure &&
        shouldTripCircuitBreaker({
            consecutiveFailures: claimedDelivery.endpoint_consecutive_failures + 1,
            healthySinceMs: Date.parse(claimedDelivery.endpoint_healthy_since),
            nowMs: sweepContext.nowMs,
        })
    )
        disableReason = 'circuit_breaker';

    const { data: wasRecorded, error: recordError } = await sweepContext.adminClient.rpc(
        'complete_webhook_delivery',
        {
            p_delivery_id: claimedDelivery.delivery_id,
            p_status: outcome.status,
            p_next_attempt_at: outcome.nextAttemptAt,
            p_status_code: attemptResult.statusCode,
            p_error_class: attemptResult.transportErrorClass,
            p_counts_as_failure: outcome.countsAsEndpointFailure,
            p_disable_reason: disableReason,
        },
    );
    if (recordError) {
        // The lease expires and the delivery is claimed again: a duplicate send is possible, a lost event is not
        console.error('[webhooks] recording the outcome failed', {
            deliveryId: claimedDelivery.delivery_id,
            endpointId: claimedDelivery.endpoint_id,
            detail: recordError.message,
        });
        return 'record_failed';
    }
    return wasRecorded ? outcome.status : 'lease_lost';
}

/**
 * Claims and delivers due webhooks until nothing is due or the time budget is spent.
 *
 * @param {{ adminClient: object, sendRequest?: Function, nowFn?: () => number, randomFn?: () => number,
 *   budgetMs?: number }} sweepOptions - Database client plus injectable send, clock, randomness and budget.
 * @returns {Promise<{ claimed: number, countByOutcome: Record<string, number> } | { error: string }>} Counts by outcome,
 *   or an error string when claiming fails.
 */
export async function runWebhookSweep({
    adminClient,
    sendRequest = sendWebhookRequest,
    nowFn = Date.now,
    randomFn = Math.random,
    budgetMs = SWEEP_BUDGET_MS,
}) {
    const startedAtMs = nowFn();
    const secretsByEndpointId = new Map();
    const countByOutcome = {};
    let claimedTotal = 0;

    while (nowFn() - startedAtMs < budgetMs) {
        const { data: claimedDeliveries, error: claimError } = await adminClient.rpc(
            'claim_webhook_deliveries',
            {
                p_limit: CLAIM_BATCH_SIZE,
                p_per_endpoint: CLAIMS_PER_ENDPOINT,
                p_max_attempts: MAX_DELIVERY_ATTEMPTS,
            },
        );
        if (claimError) {
            console.error('[webhooks] claiming deliveries failed', { detail: claimError.message });
            return { error: 'claim_failed' };
        }
        if (!claimedDeliveries || claimedDeliveries.length === 0) break;

        claimedTotal += claimedDeliveries.length;
        const sweepContext = { adminClient, sendRequest, secretsByEndpointId, nowMs: nowFn() };
        const batchOutcomes = await Promise.all(
            claimedDeliveries.map((claimedDelivery) =>
                processClaimedDelivery(claimedDelivery, sweepContext, randomFn),
            ),
        );
        for (const batchOutcome of batchOutcomes)
            countByOutcome[batchOutcome] = (countByOutcome[batchOutcome] ?? 0) + 1;
    }

    return { claimed: claimedTotal, countByOutcome };
}
