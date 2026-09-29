// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
    classifyTransportError,
    parseRetryAfterSeconds,
    sendWebhookRequest,
} from './webhook-http-sender';

describe('classifyTransportError', () => {
    it.each([
        [{ code: 'WEBHOOK_URL_BLOCKED' }, 'blocked_address'],
        [{ code: 'WEBHOOK_DNS_FAILED' }, 'dns'],
        [{ code: 'ENOTFOUND' }, 'dns'],
        [{ code: 'EAI_AGAIN' }, 'dns'],
        [{ code: 'ETIMEDOUT' }, 'timeout'],
        [{ code: 'ABORT_ERR', name: 'AbortError' }, 'timeout'],
        [{ name: 'TimeoutError' }, 'timeout'],
        [{ code: 'ECONNREFUSED' }, 'connection'],
        [{ code: 'ECONNRESET' }, 'connection'],
        [{ code: 'CERT_HAS_EXPIRED' }, 'tls'],
        [{ code: 'DEPTH_ZERO_SELF_SIGNED_CERT' }, 'tls'],
        [{ code: 'ERR_TLS_CERT_ALTNAME_INVALID' }, 'tls'],
        [{ code: 'SOMETHING_ELSE' }, 'unknown'],
        [undefined, 'unknown'],
    ])('maps %j to %s', (networkError, expectedClass) => {
        expect(classifyTransportError(networkError)).toBe(expectedClass);
    });
});

describe('parseRetryAfterSeconds', () => {
    const NOW = Date.parse('2026-01-01T12:00:00.000Z');

    it('reads whole seconds', () => {
        expect(parseRetryAfterSeconds('120', NOW)).toBe(120);
    });

    it('reads an HTTP date relative to now, never negative', () => {
        expect(parseRetryAfterSeconds('Thu, 01 Jan 2026 12:05:00 GMT', NOW)).toBe(300);
        expect(parseRetryAfterSeconds('Thu, 01 Jan 2026 11:00:00 GMT', NOW)).toBe(0);
    });

    it.each([undefined, '', 'soon', '-5'])('returns null for %j', (header) => {
        expect(parseRetryAfterSeconds(header, NOW)).toBeNull();
    });
});

describe('sendWebhookRequest', () => {
    it.each(['http://example.com/x', 'https://localhost/x', 'https://127.0.0.1/x', 'not a url'])(
        'refuses %s without opening a connection',
        async (url) => {
            expect(
                await sendWebhookRequest({ url, signatureHeaders: {}, requestBody: '{}' }),
            ).toEqual({
                statusCode: null,
                transportErrorClass: 'blocked_address',
                retryAfterSeconds: null,
            });
        },
    );
});
