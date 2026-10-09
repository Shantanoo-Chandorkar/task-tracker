/**
 * Tells the active service worker to evict its cached copies of the given URLs/prefixes, so
 * the next visit fetches fresh instead of the old stale-while-revalidate snapshot.
 *
 * Safe no-op without an active service worker (first load, failed registration, etc.).
 *
 * @param {object} target
 * @param {string[]} [target.urls] - Exact pathnames to evict (e.g. '/lists/abc-123')
 * @param {string[]} [target.prefixes] - Pathname prefixes to evict every cached match under
 */
export function bustPageCache({ urls = [], prefixes = [] }) {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker?.controller) return;
    navigator.serviceWorker.controller.postMessage({ type: 'BUST_PAGE_CACHE', urls, prefixes });
}
