import { describe, expect, it, vi } from 'vitest';
import { bustPageCache } from '@/lib/cache/service-worker-cache';
import { refetchSpaceSharing } from './refetch-space-sharing';

vi.mock('@/lib/cache/service-worker-cache', () => ({ bustPageCache: vi.fn() }));

describe('refetchSpaceSharing', () => {
    it('reloads collaborators, then invites, then clears the spaces page cache', async () => {
        const eventLog = [];
        const queryClient = {
            invalidateQueries: async ({ queryKey }) => eventLog.push(queryKey.join(':')),
        };
        bustPageCache.mockImplementation(() => eventLog.push('bust'));

        await refetchSpaceSharing(queryClient, 'space-1');

        expect(eventLog).toEqual(['space-collaborators:space-1', 'space-invites:space-1', 'bust']);
        expect(bustPageCache).toHaveBeenCalledWith({ urls: ['/spaces'] });
    });
});
