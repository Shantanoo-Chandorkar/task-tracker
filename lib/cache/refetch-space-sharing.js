import { bustPageCache } from '@/lib/cache/service-worker-cache';

/**
 * Reloads who has access to a space and who is invited, and clears the cached spaces page.
 *
 * @param {import('@tanstack/react-query').QueryClient} queryClient - Client holding the cache
 * @param {string} spaceId - Space whose collaborators and invites changed
 * @returns {Promise<void>} Resolves when both lists have reloaded
 */
export async function refetchSpaceSharing(queryClient, spaceId) {
    await queryClient.invalidateQueries({ queryKey: ['space-collaborators', spaceId] });
    await queryClient.invalidateQueries({ queryKey: ['space-invites', spaceId] });
    bustPageCache({ urls: ['/spaces'] });
}
