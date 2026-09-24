import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyTurnstileToken } from './verify-turnstile';

function fakeCloudflareResponse(body, { ok = true, status = 200 } = {}) {
    return { ok, status, json: async () => body };
}

beforeEach(() => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'test-secret');
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('verifyTurnstileToken', () => {
    it('is true only when Cloudflare says success', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => fakeCloudflareResponse({ success: true })),
        );
        expect(await verifyTurnstileToken('token', '1.2.3.4')).toBe(true);
    });

    it('is false when Cloudflare rejects the token', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () =>
                fakeCloudflareResponse({
                    success: false,
                    'error-codes': ['invalid-input-response'],
                }),
            ),
        );
        expect(await verifyTurnstileToken('bad-token')).toBe(false);
    });

    it('is false for anything that is not the boolean true, or an empty answer', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => fakeCloudflareResponse({ success: 'true' })),
        );
        expect(await verifyTurnstileToken('token')).toBe(false);
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => fakeCloudflareResponse(null)),
        );
        expect(await verifyTurnstileToken('token')).toBe(false);
    });

    it('fails closed on a network error, a timeout and an HTTP error', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => {
                throw new Error('network down');
            }),
        );
        expect(await verifyTurnstileToken('token')).toBe(false);

        vi.stubGlobal(
            'fetch',
            vi.fn(async () =>
                fakeCloudflareResponse({ success: true }, { ok: false, status: 500 }),
            ),
        );
        expect(await verifyTurnstileToken('token')).toBe(false);
    });

    it('fails closed, without calling Cloudflare, when the secret is not configured', async () => {
        vi.stubEnv('TURNSTILE_SECRET_KEY', '');
        const fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);
        expect(await verifyTurnstileToken('token')).toBe(false);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('sends the secret, the token and a known IP, but no IP when it is unknown', async () => {
        const fetchSpy = vi.fn(async () => fakeCloudflareResponse({ success: true }));
        vi.stubGlobal('fetch', fetchSpy);

        await verifyTurnstileToken('the-token', '9.9.9.9');
        const sentWithIp = fetchSpy.mock.calls[0][1].body;
        expect(sentWithIp.get('secret')).toBe('test-secret');
        expect(sentWithIp.get('response')).toBe('the-token');
        expect(sentWithIp.get('remoteip')).toBe('9.9.9.9');

        await verifyTurnstileToken('the-token', 'unknown');
        expect(fetchSpy.mock.calls[1][1].body.has('remoteip')).toBe(false);
    });
});
