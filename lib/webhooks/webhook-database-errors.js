import {
    WEBHOOK_ACTION_FAILED,
    WEBHOOK_DELIVERY_NOT_FOUND,
    WEBHOOK_ENDPOINT_DISABLED,
    WEBHOOK_ENDPOINT_LIMIT,
    WEBHOOK_ENDPOINT_NOT_FOUND,
    WEBHOOK_RETRY_NOT_ALLOWED,
    WEBHOOK_RETRY_TOO_SOON,
    WEBHOOK_TEST_RATE_LIMITED,
    WEBHOOK_URL_DUPLICATE,
} from '@/lib/error-codes';

const UNIQUE_VIOLATION = '23505';

const FRIENDLY_MESSAGE_BY_CODE = {
    [WEBHOOK_ENDPOINT_LIMIT]: 'This space already has the maximum number of webhooks',
    [WEBHOOK_ENDPOINT_NOT_FOUND]: 'That webhook no longer exists',
    [WEBHOOK_ENDPOINT_DISABLED]: 'Turn this webhook on first',
    [WEBHOOK_TEST_RATE_LIMITED]: 'Too many test events. Wait a minute and try again',
    [WEBHOOK_DELIVERY_NOT_FOUND]: 'That delivery no longer exists',
    [WEBHOOK_RETRY_NOT_ALLOWED]: 'Only failed deliveries can be retried',
    [WEBHOOK_RETRY_TOO_SOON]: 'That delivery was tried a moment ago. Wait 30 seconds and try again',
};

/**
 * Turns a database error into a stable code and a safe message; unknown errors get a generic one.
 *
 * @param {{ code?: string, message?: string }|null|undefined} databaseError - Supabase error.
 * @param {string} fallbackMessage - Message for an unrecognised error, e.g. 'Failed to save webhook'.
 * @returns {{ error: string, code: string, isKnown: boolean }} Result to return to the caller; `isKnown` is false
 *   when the caller should log the underlying error.
 */
export function toWebhookFailure(databaseError, fallbackMessage) {
    if (databaseError?.code === UNIQUE_VIOLATION)
        return {
            error: 'This space already sends to that URL',
            code: WEBHOOK_URL_DUPLICATE,
            isKnown: true,
        };

    const knownCode = Object.keys(FRIENDLY_MESSAGE_BY_CODE).find((code) =>
        databaseError?.message?.includes(code),
    );
    if (knownCode)
        return { error: FRIENDLY_MESSAGE_BY_CODE[knownCode], code: knownCode, isKnown: true };

    return { error: fallbackMessage, code: WEBHOOK_ACTION_FAILED, isKnown: false };
}
