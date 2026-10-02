import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearAllCaches } from './cache';

describe('clearAllCaches', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('clears the query client and deletes every Cache Storage bucket', async () => {
        const queryClient = { clear: vi.fn() };
        const deleteCache = vi.fn().mockResolvedValue(true);
        vi.stubGlobal('caches', {
            keys: vi.fn().mockResolvedValue(['pages', 'assets']),
            delete: deleteCache,
        });

        await clearAllCaches(queryClient);

        expect(queryClient.clear).toHaveBeenCalledOnce();
        expect(deleteCache).toHaveBeenCalledWith('pages');
        expect(deleteCache).toHaveBeenCalledWith('assets');
    });

    it('still resolves, after clearing the query client, when Cache Storage rejects', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const queryClient = { clear: vi.fn() };
        vi.stubGlobal('caches', { keys: vi.fn().mockRejectedValue(new Error('storage blocked')) });

        await expect(clearAllCaches(queryClient)).resolves.toBeUndefined();
        expect(queryClient.clear).toHaveBeenCalledOnce();
    });

    it('does nothing extra when Cache Storage is unavailable', async () => {
        const queryClient = { clear: vi.fn() };
        vi.stubGlobal('caches', undefined);

        await expect(clearAllCaches(queryClient)).resolves.toBeUndefined();
        expect(queryClient.clear).toHaveBeenCalledOnce();
    });
});
