/**
 * Clears every client-side cache - React Query's store and all Cache Storage buckets for this origin.
 * Not wired to any auth event yet - call it from the sign-out flow once multi-user auth ships.
 *
 * @param {import('@tanstack/react-query').QueryClient} queryClient - From the caller's useQueryClient()
 * @returns {Promise<void>}
 */
export async function clearAllCaches(queryClient) {
    queryClient.clear();

    if (typeof caches === 'undefined') return;
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
}
