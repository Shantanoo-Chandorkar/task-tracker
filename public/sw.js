// Bumped on any change to this file's caching logic so `activate` evicts stale caches.
const CACHE_NAME = 'task-tracker-shell-v3';

// Fixed, known-ahead-of-time assets only. Page HTML and API responses are
// cached at runtime instead — Next's chunk filenames are content-hashed and
// unknown here, and there's no fixed set of "pages" to precache in an app
// where every route is server-rendered per-request.
const SHELL_ASSETS = [
    '/',
    '/manifest.webmanifest',
    '/icon.png',
    '/apple-icon.png',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((cacheNames) =>
                Promise.all(
                    cacheNames
                        .filter((cacheName) => cacheName !== CACHE_NAME)
                        .map((cacheName) => caches.delete(cacheName)),
                ),
            ),
    );
});

self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
    const { request } = event;

    // Never touch mutations (POST/PATCH/DELETE to /api/*, Next Server Actions
    // are POSTs too) or cross-origin requests — only same-origin GETs are cached.
    if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
        return;
    }

    // Navigations get stale-while-revalidate for an instant shell paint on repeat visits.
    // Everything else stays network-first — mutations POST to the page URL, not /api/*, no bust signal.
    const isNavigation = request.mode === 'navigate' || request.destination === 'document';

    if (isNavigation) {
        event.respondWith(
            caches.match(request).then((cached) => {
                const networkUpdate = fetch(request)
                    .then((response) => {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
                        return response;
                    })
                    .catch(() => cached);

                if (cached) {
                    event.waitUntil(networkUpdate);
                    return cached;
                }
                return networkUpdate;
            }),
        );
        return;
    }

    event.respondWith(
        fetch(request)
            .then((response) => {
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
                return response;
            })
            .catch(() => caches.match(request)),
    );
});
