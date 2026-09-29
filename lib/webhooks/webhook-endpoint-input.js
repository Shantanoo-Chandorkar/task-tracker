import { checkMaxLength, sanitizeString } from '@/lib/validation';
import {
    WEBHOOK_EVENT_TYPES_INVALID,
    WEBHOOK_INPUT_INVALID,
    WEBHOOK_PAYLOAD_LEVEL_INVALID,
} from '@/lib/error-codes';
import { SUBSCRIBABLE_EVENT_TYPES } from '@/lib/webhooks/webhook-event-catalog';
import { PAYLOAD_LEVELS } from '@/lib/webhooks/webhook-payload-projection';
import { checkWebhookUrl } from '@/lib/webhooks/webhook-url-guard';

const MAX_NAME_LENGTH = 100;
const DEFAULT_NAME = 'Webhook';

/**
 * Validates endpoint fields and returns only the allowlisted ones: name, url, event_types, payload_level.
 *
 * @param {object} fields - Raw fields from the settings form.
 * @param {{ isPartial?: boolean }} [validationMode] - Partial (update) checks only the fields present; a full
 *   (create) input requires url and event_types.
 * @returns {{ isValid: true, cleanedFields: object } | { isValid: false, error: string, code: string }} The cleaned cleanedFields,
 *   or a message and stable code.
 */
export function validateWebhookEndpointInput(fields, { isPartial = false } = {}) {
    if (!fields || typeof fields !== 'object')
        return {
            isValid: false,
            error: 'Webhook details are required',
            code: WEBHOOK_INPUT_INVALID,
        };

    const cleanedFields = {};

    if ('name' in fields || !isPartial) {
        const name = sanitizeString(fields.name, true) || DEFAULT_NAME;
        const nameError = checkMaxLength(name, MAX_NAME_LENGTH, 'Webhook name');
        if (nameError) return { isValid: false, ...nameError };
        cleanedFields.name = name;
    }

    if ('url' in fields || !isPartial) {
        const urlCheck = checkWebhookUrl(sanitizeString(fields.url, false));
        if (!urlCheck.isValid)
            return { isValid: false, error: 'Enter a public https URL', code: urlCheck.code };
        cleanedFields.url = urlCheck.url.href;
    }

    if ('event_types' in fields || !isPartial) {
        const requestedTypes = fields.event_types;
        const hasOnlyKnownEventTypes =
            Array.isArray(requestedTypes) &&
            requestedTypes.length > 0 &&
            requestedTypes.every((eventType) => SUBSCRIBABLE_EVENT_TYPES.includes(eventType));
        if (!hasOnlyKnownEventTypes)
            return {
                isValid: false,
                error: 'Choose at least one event to send',
                code: WEBHOOK_EVENT_TYPES_INVALID,
            };
        cleanedFields.event_types = [...new Set(requestedTypes)];
    }

    if ('payload_level' in fields || !isPartial) {
        const payloadLevel = fields.payload_level ?? 'standard';
        if (!PAYLOAD_LEVELS.includes(payloadLevel))
            return {
                isValid: false,
                error: 'Choose how much detail to send',
                code: WEBHOOK_PAYLOAD_LEVEL_INVALID,
            };
        cleanedFields.payload_level = payloadLevel;
    }

    return { isValid: true, cleanedFields };
}
