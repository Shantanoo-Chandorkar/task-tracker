import { TASK_EVENT_TYPES } from '@/lib/webhooks/webhook-event-catalog';

export const ALL_TASK_EVENTS = 'task.*';

const EVENT_LABEL_BY_TYPE = {
    'task.created': 'Task created',
    'task.updated': 'Task edited',
    'task.status_changed': 'Status changed',
    'task.completed': 'Task completed',
    'task.uncompleted': 'Task reopened',
    'task.priority_changed': 'Priority changed',
    'task.due_date_changed': 'Due date changed',
    'task.moved': 'Task moved',
    'task.deleted': 'Task deleted',
    'webhook.test': 'Test event',
};

export const EVENT_OPTIONS = TASK_EVENT_TYPES.map((eventType) => ({
    value: eventType,
    label: EVENT_LABEL_BY_TYPE[eventType],
}));

export const PAYLOAD_LEVEL_OPTIONS = [
    {
        value: 'minimal',
        label: 'Minimal',
        hint: 'Ids and which fields changed. No titles or text.',
    },
    {
        value: 'standard',
        label: 'Standard',
        hint: 'Adds titles, names, status, due date and changes.',
    },
    { value: 'full', label: 'Full', hint: 'Adds task descriptions. Only for receivers you trust.' },
];

const ERROR_TEXT_BY_CLASS = {
    timeout: 'Timed out',
    connection: 'Could not connect',
    dns: 'Address not found',
    tls: 'Certificate problem',
    blocked_address: 'Address not allowed',
    response_too_large: 'Response too large',
    lease_expired: 'Sender was interrupted',
    unknown: 'Unexpected error',
};

const ENDPOINT_STATUS_BY_REASON = {
    manual: { label: 'Off', tone: 'off', detail: 'You turned this webhook off.' },
    circuit_breaker: {
        label: 'Paused',
        tone: 'paused',
        detail: 'Turned off automatically after many failed deliveries. Fix the receiver, then turn it back on.',
    },
    backlog: {
        label: 'Paused',
        tone: 'paused',
        detail: 'Turned off automatically because too many events were waiting. Fix the receiver, then turn it back on.',
    },
    gone: {
        label: 'Paused',
        tone: 'paused',
        detail: 'The receiver answered that it no longer exists (HTTP 410). Update the URL, then turn it back on.',
    },
};

/**
 * Shows where a webhook points without exposing its path or query, which often carries a secret token.
 *
 * @param {string} webhookUrl - Stored https URL.
 * @returns {string} The origin, with an ellipsis when a path or query is hidden.
 */
export function maskWebhookUrl(webhookUrl) {
    try {
        const { origin, pathname, search } = new URL(webhookUrl);
        return pathname === '/' && !search ? origin : `${origin}/…`;
    } catch {
        return 'Invalid address';
    }
}

/**
 * Human label for an event type, falling back to the raw type for one added later.
 *
 * @param {string} eventType - Type such as 'task.completed'.
 * @returns {string} Label for display.
 */
export function describeEventType(eventType) {
    return EVENT_LABEL_BY_TYPE[eventType] ?? eventType;
}

/**
 * One-line summary of what an endpoint is subscribed to.
 *
 * @param {string[]} eventTypes - Subscribed types, possibly the 'task.*' wildcard.
 * @returns {string} e.g. 'All task events' or '3 events'.
 */
export function summarizeEventTypes(eventTypes) {
    if (eventTypes.includes(ALL_TASK_EVENTS)) return 'All task events';
    return eventTypes.length === 1
        ? describeEventType(eventTypes[0])
        : `${eventTypes.length} events`;
}

/**
 * Turns an endpoint's enabled state and disable reason into a badge and an explanation.
 *
 * @param {{ enabled: boolean, disabled_reason: string|null }} endpoint - Endpoint row.
 * @returns {{ label: string, tone: 'active'|'off'|'paused', detail: string|null }} What to show the owner.
 */
export function describeEndpointStatus(endpoint) {
    if (endpoint.enabled) return { label: 'Active', tone: 'active', detail: null };
    return (
        ENDPOINT_STATUS_BY_REASON[endpoint.disabled_reason] ?? {
            label: 'Off',
            tone: 'off',
            detail: 'This webhook is off.',
        }
    );
}

/**
 * Turns a delivery row into a status badge and the reason it failed, if it did.
 *
 * @param {{ status: string, last_status_code: number|null, last_error_class: string|null }} delivery - Delivery row.
 * @returns {{ label: string, tone: 'good'|'pending'|'bad', reason: string|null }} What to show the owner.
 */
export function describeDelivery(delivery) {
    const reason = describeFailureReason(delivery);
    switch (delivery.status) {
        case 'delivered':
            return { label: 'Delivered', tone: 'good', reason: null };
        case 'failed':
            return { label: 'Failed', tone: 'bad', reason };
        case 'retrying':
            return { label: 'Retrying', tone: 'pending', reason };
        case 'processing':
            return { label: 'Sending', tone: 'pending', reason: null };
        default:
            return { label: 'Queued', tone: 'pending', reason: null };
    }
}

/**
 * Explains the last failed attempt in plain words.
 *
 * @param {{ last_status_code: number|null, last_error_class: string|null }} delivery - Delivery row.
 * @returns {string|null} 'Receiver answered HTTP 500', 'Timed out', and so on; null when nothing failed yet.
 */
function describeFailureReason(delivery) {
    if (delivery.last_status_code) return `Receiver answered HTTP ${delivery.last_status_code}`;
    if (delivery.last_error_class)
        return ERROR_TEXT_BY_CLASS[delivery.last_error_class] ?? ERROR_TEXT_BY_CLASS.unknown;
    return null;
}
