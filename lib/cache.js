/**
 * Clears every client-side cache - React Query's store and all Cache Storage buckets for this origin.
 * Never rejects: sign-in/out callers navigate right after it, so a Cache Storage failure is logged, not thrown.
 *
 * @param {import('@tanstack/react-query').QueryClient} queryClient - From the caller's useQueryClient()
 * @returns {Promise<void>}
 */
export async function clearAllCaches(queryClient) {
    queryClient.clear();

    if (typeof caches === 'undefined') return;
    try {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
    } catch (cacheError) {
        console.error('[cache] clearing Cache Storage failed', { detail: cacheError?.message });
    }
}
