import { afterEach, describe, expect, it, vi } from 'vitest';
import { FetchError, fetchJson, shouldRetryRequest } from './fetch-json';

const fetchMock = vi.fn();

afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
});

function stubFetch(response) {
    fetchMock.mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);
}

describe('fetchJson', () => {
    it('returns the parsed body of an OK reply', async () => {
        stubFetch({ ok: true, json: async () => [{ id: 's1' }] });

        await expect(fetchJson('/api/spaces')).resolves.toEqual([{ id: 's1' }]);
    });

    it('forwards the abort signal to fetch', async () => {
        stubFetch({ ok: true, json: async () => ({}) });
        const abortController = new AbortController();

        await fetchJson('/api/spaces', { signal: abortController.signal });

        expect(fetchMock).toHaveBeenCalledWith('/api/spaces', { signal: abortController.signal });
    });

    it('throws a FetchError with the status, message and code the server sent', async () => {
        stubFetch({
            ok: false,
            status: 401,
            json: async () => ({ error: 'You must be logged in', code: 'NOT_AUTHENTICATED' }),
        });

        const failure = await fetchJson('/api/spaces').catch((caught) => caught);

        expect(failure).toBeInstanceOf(FetchError);
        expect(failure.status).toBe(401);
        expect(failure.code).toBe('NOT_AUTHENTICATED');
        expect(failure.message).toBe('You must be logged in');
    });

    it('falls back to a generic message when an error reply is not JSON', async () => {
        stubFetch({
            ok: false,
            status: 502,
            json: async () => {
                throw new SyntaxError('Unexpected token <');
            },
        });

        const failure = await fetchJson('/api/spaces').catch((caught) => caught);

        expect(failure.status).toBe(502);
        expect(failure.code).toBeNull();
        expect(failure.message).toBe('Request failed with status 502');
    });

    it('throws a FetchError when an OK reply is not JSON', async () => {
        stubFetch({
            ok: true,
            status: 200,
            json: async () => {
                throw new SyntaxError('Unexpected end of JSON input');
            },
        });

        await expect(fetchJson('/api/spaces')).rejects.toBeInstanceOf(FetchError);
    });

    it('lets a network failure through unchanged, so it has no status to be mistaken for a 4xx', async () => {
        fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
        vi.stubGlobal('fetch', fetchMock);

        const failure = await fetchJson('/api/spaces').catch((caught) => caught);

        expect(failure).toBeInstanceOf(TypeError);
        expect(failure.status).toBeUndefined();
    });
});

describe('shouldRetryRequest', () => {
    const clientError = new FetchError('Not found', { status: 404, code: null });
    const serverError = new FetchError('Boom', { status: 500, code: null });

    it('never retries a 4xx reply', () => {
        expect(shouldRetryRequest(0, clientError)).toBe(false);
    });

    it('retries a 5xx reply twice, then gives up', () => {
        expect(shouldRetryRequest(0, serverError)).toBe(true);
        expect(shouldRetryRequest(1, serverError)).toBe(true);
        expect(shouldRetryRequest(2, serverError)).toBe(false);
    });

    it('retries a network failure, which has no status', () => {
        expect(shouldRetryRequest(0, new TypeError('Failed to fetch'))).toBe(true);
    });
});
