import https from 'node:https';
import { TRANSPORT_ERROR_CLASSES } from '@/lib/webhooks/delivery-retry-policy';
import { checkWebhookUrl, createGuardedLookup } from '@/lib/webhooks/webhook-url-guard';
import { WEBHOOK_DNS_FAILED, WEBHOOK_URL_BLOCKED } from '@/lib/error-codes';

const REQUEST_TIMEOUT_MS = 10_000;
const USER_AGENT = 'TaskTracker-Webhooks/1';
const DNS_ERROR_CODES = new Set([WEBHOOK_DNS_FAILED, 'ENOTFOUND', 'EAI_AGAIN']);
const CONNECTION_ERROR_CODES = new Set([
    'ECONNREFUSED',
    'ECONNRESET',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'EPIPE',
]);
const TIMEOUT_ERROR_CODES = new Set(['ETIMEDOUT', 'ABORT_ERR']);

/**
 * Maps a low-level network error to one of the short error classes stored on the delivery row.
 *
 * @param {Error & { code?: string }} networkError - Error raised by the HTTPS request.
 * @returns {string} A value from `TRANSPORT_ERROR_CLASSES`.
 */
export function classifyTransportError(networkError) {
    const errorCode = networkError?.code ?? '';
    if (errorCode === WEBHOOK_URL_BLOCKED) return TRANSPORT_ERROR_CLASSES.BLOCKED_ADDRESS;
    if (DNS_ERROR_CODES.has(errorCode)) return TRANSPORT_ERROR_CLASSES.DNS;
    if (
        TIMEOUT_ERROR_CODES.has(errorCode) ||
        networkError?.name === 'AbortError' ||
        networkError?.name === 'TimeoutError'
    )
        return TRANSPORT_ERROR_CLASSES.TIMEOUT;
    if (CONNECTION_ERROR_CODES.has(errorCode)) return TRANSPORT_ERROR_CLASSES.CONNECTION;
    if (/CERT|^ERR_TLS|^ERR_SSL|SELF_SIGNED|UNABLE_TO_VERIFY/.test(errorCode))
        return TRANSPORT_ERROR_CLASSES.TLS;
    return TRANSPORT_ERROR_CLASSES.UNKNOWN;
}

/**
 * Reads a Retry-After header, which is either whole seconds or an HTTP date.
 *
 * @param {string|undefined} retryAfterHeader - Raw header value from the receiver.
 * @param {number} nowMs - Current time in milliseconds.
 * @returns {number|null} Seconds to wait, or null when the header is absent or unusable.
 */
export function parseRetryAfterSeconds(retryAfterHeader, nowMs) {
    if (!retryAfterHeader) return null;
    if (/^\d+$/.test(retryAfterHeader.trim())) return Number(retryAfterHeader);
    // Date.parse accepts bare numbers like "-5", so only text with letters (a weekday or month name) counts as a date
    if (!/[a-z]/i.test(retryAfterHeader)) return null;
    const retryAtMs = Date.parse(retryAfterHeader);
    return Number.isNaN(retryAtMs) ? null : Math.max(0, Math.ceil((retryAtMs - nowMs) / 1000));
}

/**
 * POSTs one signed webhook body: no redirects, 10 s limit, response body never read, address checked at connect.
 *
 * @param {{ url: string, signatureHeaders: object, requestBody: string }} webhookRequest - Endpoint URL, the
 *   Standard Webhooks headers, and the exact JSON string that was signed.
 * @returns {Promise<{ statusCode: number|null, transportErrorClass: string|null, retryAfterSeconds: number|null }>}
 *   Always resolves; a network failure is reported as an error class, not thrown.
 */
export function sendWebhookRequest({ url, signatureHeaders, requestBody }) {
    return new Promise((resolve) => {
        const urlCheck = checkWebhookUrl(url);
        if (!urlCheck.isValid) {
            resolve({
                statusCode: null,
                transportErrorClass: TRANSPORT_ERROR_CLASSES.BLOCKED_ADDRESS,
                retryAfterSeconds: null,
            });
            return;
        }

        let isSettled = false;
        const settle = (attemptResult) => {
            if (isSettled) return;
            isSettled = true;
            resolve(attemptResult);
        };

        const request = https.request(
            urlCheck.url,
            {
                method: 'POST',
                headers: {
                    ...signatureHeaders,
                    'content-type': 'application/json',
                    'content-length': Buffer.byteLength(requestBody),
                    'user-agent': USER_AGENT,
                },
                lookup: createGuardedLookup(),
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            },
            (response) => {
                settle({
                    statusCode: response.statusCode,
                    transportErrorClass: null,
                    retryAfterSeconds: parseRetryAfterSeconds(
                        response.headers['retry-after'],
                        Date.now(),
                    ),
                });
                response.destroy();
            },
        );
        request.on('error', (networkError) =>
            settle({
                statusCode: null,
                transportErrorClass: classifyTransportError(networkError),
                retryAfterSeconds: null,
            }),
        );
        request.end(requestBody);
    });
}
