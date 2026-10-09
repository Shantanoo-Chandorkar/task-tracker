'use server';

import { withAuthenticatedAction } from '@/lib/auth/with-authenticated-action';
import { resolveSpacePermission } from '@/lib/permissions/space-permissions';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import {
    WEBHOOK_DELIVERY_NOT_FOUND,
    WEBHOOK_ENDPOINT_NOT_FOUND,
    WEBHOOK_INPUT_INVALID,
    WEBHOOK_OWNER_ONLY,
} from '@/lib/error-codes';
import { toWebhookFailure } from '@/lib/webhooks/webhook-database-errors';
import { validateWebhookEndpointInput } from '@/lib/webhooks/webhook-endpoint-input';
import { generateWebhookSecret } from '@/lib/webhooks/webhook-signature';
import { resolvePublicAddresses } from '@/lib/webhooks/webhook-url-guard';

// Never select('*'): column grants hide the secret ids, so a star is rejected by design
const ENDPOINT_COLUMNS =
    'id, space_id, name, url, event_types, payload_level, enabled, disabled_reason, consecutive_failures, ' +
    'previous_secret_expires_at, last_success_at, last_failure_at, created_at, updated_at';
const DELIVERY_LOG_LIMIT = 50;

const ownerOnlyFailure = {
    error: 'Only the space owner can manage webhooks',
    code: WEBHOOK_OWNER_ONLY,
};
const endpointNotFoundFailure = {
    error: 'That webhook no longer exists',
    code: WEBHOOK_ENDPOINT_NOT_FOUND,
};

/**
 * Loads an endpoint through the caller's session; row level security hides it from everyone but the space owner.
 *
 * @param {object} supabase - Request-scoped Supabase client.
 * @param {string} endpointId - Endpoint to load.
 * @returns {Promise<{ id: string, space_id: string, enabled: boolean }|null>} The endpoint, or null.
 */
async function loadOwnedEndpoint(supabase, endpointId) {
    if (typeof endpointId !== 'string' || !endpointId) return null;
    const { data: endpoint } = await supabase
        .from('webhook_endpoints')
        .select('id, space_id, enabled')
        .eq('id', endpointId)
        .maybeSingle();
    return endpoint;
}

/**
 * Refuses an unresolvable or non-public host, so the owner hears now instead of from a failed delivery.
 *
 * @param {string} webhookUrl - Already syntax-checked https URL.
 * @returns {Promise<{ error: string, code: string }|null>} A failure result, or null when the host is public.
 */
async function checkHostIsPublic(webhookUrl) {
    const resolution = await resolvePublicAddresses(new URL(webhookUrl).hostname);
    if (resolution.isPublic) return null;
    return { error: 'That address cannot be reached from the internet', code: resolution.code };
}

/**
 * Turns a failed database call into a result, logging only the unrecognised ones.
 *
 * @param {string} logLabel - Log prefix such as '[webhooks] create'.
 * @param {object} databaseError - Error from Supabase.
 * @param {string} fallbackMessage - Message for an unrecognised error.
 * @returns {{ error: string, code: string }} Result for the caller.
 */
function failureFromDatabaseError(logLabel, databaseError, fallbackMessage) {
    const { error, code, isKnown } = toWebhookFailure(databaseError, fallbackMessage);
    if (!isKnown) console.error(`${logLabel} failed`, { detail: databaseError?.message });
    return { error, code };
}

/**
 * Lists a space's webhook endpoints. Owner only.
 *
 * @param {string} spaceId - Space to list.
 * @returns {{ data: object[]|null, error: string|null, code: string|undefined }}
 */
export const listWebhookEndpoints = withAuthenticatedAction(
    '[webhooks] list',
    'Unexpected error loading webhooks',
    async (user, supabase, spaceId) => {
        if (!spaceId)
            return { data: null, error: 'Space ID is required', code: WEBHOOK_INPUT_INVALID };
        if ((await resolveSpacePermission(supabase, spaceId)) !== 'owner')
            return { data: null, ...ownerOnlyFailure };

        const { data: endpoints, error } = await supabase
            .from('webhook_endpoints')
            .select(ENDPOINT_COLUMNS)
            .eq('space_id', spaceId)
            .order('created_at');
        if (error)
            return {
                data: null,
                ...failureFromDatabaseError('[webhooks] list', error, 'Failed to load webhooks'),
            };
        return { data: endpoints, error: null };
    },
    { blockGuest: true },
);

/**
 * Creates a webhook endpoint and returns its signing secret exactly once.
 *
 * @param {string} spaceId - Space the endpoint belongs to.
 * @param {{ name?: string, url: string, event_types: string[], payload_level?: string }} fields - Endpoint settings.
 * @returns {{ data: { endpoint: object, secret: string }|null, error: string|null, code: string|undefined }}
 */
export const createWebhookEndpoint = withAuthenticatedAction(
    '[webhooks] create',
    'Unexpected error creating webhook',
    async (user, supabase, spaceId, fields) => {
        if (!spaceId)
            return { data: null, error: 'Space ID is required', code: WEBHOOK_INPUT_INVALID };

        const endpointInput = validateWebhookEndpointInput(fields);
        if (!endpointInput.isValid)
            return { data: null, error: endpointInput.error, code: endpointInput.code };

        if ((await resolveSpacePermission(supabase, spaceId)) !== 'owner')
            return { data: null, ...ownerOnlyFailure };

        const hostFailure = await checkHostIsPublic(endpointInput.cleanedFields.url);
        if (hostFailure) return { data: null, ...hostFailure };

        const secret = generateWebhookSecret();
        const { data: endpointId, error: createError } = await createAdminClient().rpc(
            'create_webhook_endpoint',
            {
                p_space_id: spaceId,
                p_name: endpointInput.cleanedFields.name,
                p_url: endpointInput.cleanedFields.url,
                p_event_types: endpointInput.cleanedFields.event_types,
                p_payload_level: endpointInput.cleanedFields.payload_level,
                p_secret: secret,
                p_created_by: user.id,
            },
        );
        if (createError)
            return {
                data: null,
                ...failureFromDatabaseError(
                    '[webhooks] create',
                    createError,
                    'Failed to create webhook',
                ),
            };

        const { data: endpoint } = await supabase
            .from('webhook_endpoints')
            .select(ENDPOINT_COLUMNS)
            .eq('id', endpointId)
            .maybeSingle();
        return { data: { endpoint, secret }, error: null };
    },
    { blockGuest: true },
);

/**
 * Updates an endpoint's name, URL, subscribed events or payload level. The secret is never touched.
 *
 * @param {string} endpointId - Endpoint to update.
 * @param {object} fields - Partial settings; only name, url, event_types and payload_level are read.
 * @returns {{ data: object|null, error: string|null, code: string|undefined }}
 */
export const updateWebhookEndpoint = withAuthenticatedAction(
    '[webhooks] update',
    'Unexpected error updating webhook',
    async (user, supabase, endpointId, fields) => {
        const endpointInput = validateWebhookEndpointInput(fields, { isPartial: true });
        if (!endpointInput.isValid)
            return { data: null, error: endpointInput.error, code: endpointInput.code };
        if (Object.keys(endpointInput.cleanedFields).length === 0)
            return { data: null, error: 'Nothing to update', code: WEBHOOK_INPUT_INVALID };

        if (!(await loadOwnedEndpoint(supabase, endpointId)))
            return { data: null, ...endpointNotFoundFailure };

        if (endpointInput.cleanedFields.url) {
            const hostFailure = await checkHostIsPublic(endpointInput.cleanedFields.url);
            if (hostFailure) return { data: null, ...hostFailure };
        }

        const { data: updatedEndpoint, error: updateError } = await createAdminClient()
            .from('webhook_endpoints')
            .update(endpointInput.cleanedFields)
            .eq('id', endpointId)
            .select(ENDPOINT_COLUMNS)
            .single();
        if (updateError)
            return {
                data: null,
                ...failureFromDatabaseError(
                    '[webhooks] update',
                    updateError,
                    'Failed to update webhook',
                ),
            };
        return { data: updatedEndpoint, error: null };
    },
    { blockGuest: true },
);

/**
 * Turns an endpoint on or off. Turning it on also clears the failure counter and any automatic disable reason.
 *
 * @param {string} endpointId - Endpoint to change.
 * @param {boolean} isEnabled - Desired state.
 * @returns {{ data: object|null, error: string|null, code: string|undefined }}
 */
export const setWebhookEndpointEnabled = withAuthenticatedAction(
    '[webhooks] set enabled',
    'Unexpected error changing webhook',
    async (user, supabase, endpointId, isEnabled) => {
        if (typeof isEnabled !== 'boolean')
            return { data: null, error: 'Choose on or off', code: WEBHOOK_INPUT_INVALID };
        if (!(await loadOwnedEndpoint(supabase, endpointId)))
            return { data: null, ...endpointNotFoundFailure };

        const endpointChanges = isEnabled
            ? { enabled: true, disabled_reason: null, consecutive_failures: 0 }
            : { enabled: false, disabled_reason: 'manual' };
        const { data: changedEndpoint, error: changeError } = await createAdminClient()
            .from('webhook_endpoints')
            .update(endpointChanges)
            .eq('id', endpointId)
            .select(ENDPOINT_COLUMNS)
            .single();
        if (changeError)
            return {
                data: null,
                ...failureFromDatabaseError(
                    '[webhooks] set enabled',
                    changeError,
                    'Failed to change webhook',
                ),
            };
        return { data: changedEndpoint, error: null };
    },
    { blockGuest: true },
);

/**
 * Replaces the signing secret; the old one keeps verifying for the overlap window. Returns the new secret once.
 *
 * @param {string} endpointId - Endpoint whose secret to rotate.
 * @returns {{ data: { secret: string }|null, error: string|null, code: string|undefined }}
 */
export const rotateWebhookSecret = withAuthenticatedAction(
    '[webhooks] rotate secret',
    'Unexpected error rotating secret',
    async (user, supabase, endpointId) => {
        if (!(await loadOwnedEndpoint(supabase, endpointId)))
            return { data: null, ...endpointNotFoundFailure };

        const secret = generateWebhookSecret();
        const { error: rotateError } = await createAdminClient().rpc(
            'rotate_webhook_endpoint_secret',
            { p_endpoint_id: endpointId, p_new_secret: secret },
        );
        if (rotateError)
            return {
                data: null,
                ...failureFromDatabaseError(
                    '[webhooks] rotate secret',
                    rotateError,
                    'Failed to rotate secret',
                ),
            };
        return { data: { secret }, error: null };
    },
    { blockGuest: true },
);

/**
 * Deletes an endpoint together with its deliveries and its Vault secrets.
 *
 * @param {string} endpointId - Endpoint to delete.
 * @returns {{ error: string|null, code: string|undefined }}
 */
export const deleteWebhookEndpoint = withAuthenticatedAction(
    '[webhooks] delete',
    'Unexpected error deleting webhook',
    async (user, supabase, endpointId) => {
        if (!(await loadOwnedEndpoint(supabase, endpointId))) return endpointNotFoundFailure;

        const { error: deleteError } = await createAdminClient()
            .from('webhook_endpoints')
            .delete()
            .eq('id', endpointId);
        if (deleteError)
            return failureFromDatabaseError(
                '[webhooks] delete',
                deleteError,
                'Failed to delete webhook',
            );
        return { error: null };
    },
    { blockGuest: true, hasData: false },
);

/**
 * Queues a sample event for one endpoint through the normal delivery pipeline (arrives within about 10 seconds).
 *
 * @param {string} endpointId - Endpoint to test.
 * @returns {{ data: { eventId: string }|null, error: string|null, code: string|undefined }}
 */
export const sendWebhookTestEvent = withAuthenticatedAction(
    '[webhooks] test event',
    'Unexpected error sending test event',
    async (user, supabase, endpointId) => {
        const endpoint = await loadOwnedEndpoint(supabase, endpointId);
        if (!endpoint) return { data: null, ...endpointNotFoundFailure };

        const { data: eventId, error: testError } = await createAdminClient().rpc(
            'create_webhook_test_delivery',
            { p_endpoint_id: endpointId, p_space_id: endpoint.space_id },
        );
        if (testError)
            return {
                data: null,
                ...failureFromDatabaseError(
                    '[webhooks] test event',
                    testError,
                    'Failed to send test event',
                ),
            };
        return { data: { eventId }, error: null };
    },
    { blockGuest: true },
);

/**
 * Lists the most recent deliveries for an endpoint with their event type and time.
 *
 * @param {string} endpointId - Endpoint whose delivery log to read.
 * @returns {{ data: object[]|null, error: string|null, code: string|undefined }}
 */
export const listWebhookDeliveries = withAuthenticatedAction(
    '[webhooks] list deliveries',
    'Unexpected error loading deliveries',
    async (user, supabase, endpointId) => {
        if (!(await loadOwnedEndpoint(supabase, endpointId)))
            return { data: null, ...endpointNotFoundFailure };

        const { data: deliveries, error: listError } = await supabase
            .from('webhook_deliveries')
            .select(
                'id, status, attempt_count, next_attempt_at, last_attempt_at, delivered_at, last_status_code, ' +
                    'last_error_class, created_at, webhook_events(event_type, occurred_at)',
            )
            .eq('endpoint_id', endpointId)
            .order('created_at', { ascending: false })
            .limit(DELIVERY_LOG_LIMIT);
        if (listError)
            return {
                data: null,
                ...failureFromDatabaseError(
                    '[webhooks] list deliveries',
                    listError,
                    'Failed to load deliveries',
                ),
            };
        return { data: deliveries, error: null };
    },
    { blockGuest: true },
);

/**
 * Puts a failed delivery back in the queue with a fresh attempt budget.
 *
 * @param {string} deliveryId - Failed delivery to retry.
 * @returns {{ error: string|null, code: string|undefined }}
 */
export const retryWebhookDelivery = withAuthenticatedAction(
    '[webhooks] retry delivery',
    'Unexpected error retrying delivery',
    async (user, supabase, deliveryId) => {
        const notFoundFailure = {
            error: 'That delivery no longer exists',
            code: WEBHOOK_DELIVERY_NOT_FOUND,
        };
        if (typeof deliveryId !== 'string' || !deliveryId) return notFoundFailure;

        const { data: delivery } = await supabase
            .from('webhook_deliveries')
            .select('id, space_id')
            .eq('id', deliveryId)
            .maybeSingle();
        if (!delivery) return notFoundFailure;

        const { error: retryError } = await createAdminClient().rpc('retry_webhook_delivery', {
            p_delivery_id: deliveryId,
            p_space_id: delivery.space_id,
        });
        if (retryError)
            return failureFromDatabaseError(
                '[webhooks] retry delivery',
                retryError,
                'Failed to retry delivery',
            );
        return { error: null };
    },
    { blockGuest: true, hasData: false },
);
