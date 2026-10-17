import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchDeleteCounts } from './fetch-delete-counts';

function stubFetch(response) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
}

describe('fetchDeleteCounts', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('returns the parsed counts on an OK reply', async () => {
        stubFetch({ ok: true, json: () => Promise.resolve({ task_count: 4 }) });
        await expect(fetchDeleteCounts('/api/sublists/1')).resolves.toEqual({ task_count: 4 });
    });

    it('returns null for a non-OK reply', async () => {
        stubFetch({ ok: false, json: () => Promise.resolve({ error: 'nope' }) });
        await expect(fetchDeleteCounts('/api/sublists/1')).resolves.toBeNull();
    });

    it('returns null, not a thrown error, when the reply is not JSON', async () => {
        stubFetch({ ok: true, json: () => Promise.reject(new SyntaxError('Unexpected token <')) });
        await expect(fetchDeleteCounts('/api/sublists/1')).resolves.toBeNull();
    });

    it('lets a network failure reach the caller so it can show its own message', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
        await expect(fetchDeleteCounts('/api/sublists/1')).rejects.toThrow('Failed to fetch');
    });
});
