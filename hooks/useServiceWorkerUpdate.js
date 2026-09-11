'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';

// Guards against a stray second `controllerchange` event triggering a double reload.
let refreshing = false;

function applyUpdate(registration) {
    if (!registration.waiting) return;
    registration.waiting.postMessage('SKIP_WAITING');
}

function watchForUpdate(registration) {
    function promptRefresh() {
        toast('Update available', {
            action: { label: 'Refresh', onClick: () => applyUpdate(registration) },
            duration: Infinity,
        });
    }

    // Covers a tab that was already open when a new SW finished installing in the background.
    if (registration.waiting) promptRefresh();

    registration.addEventListener('updatefound', () => {
        const installingWorker = registration.installing;
        if (!installingWorker) return;

        installingWorker.addEventListener('statechange', () => {
            // 'installed' with an existing controller means this is a real update, not the
            // very first install (which also reaches 'installed' but has nothing to compare to).
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                promptRefresh();
            }
        });
    });

    // Browsers only auto-check the SW script on a full navigation; this app is a client-side
    // SPA after first load, so poll explicitly whenever the tab is visible/focused.
    function checkForUpdate() {
        if (document.visibilityState === 'visible') registration.update();
    }
    document.addEventListener('visibilitychange', checkForUpdate);
    window.addEventListener('focus', checkForUpdate);
    const intervalId = setInterval(checkForUpdate, 60 * 1000);

    return () => {
        document.removeEventListener('visibilitychange', checkForUpdate);
        window.removeEventListener('focus', checkForUpdate);
        clearInterval(intervalId);
    };
}

/**
 * Registers `public/sw.js` and prompts (via the shared `sonner` toast) when a new
 * version has finished installing and is waiting to take over.
 */
export function useServiceWorkerUpdate() {
    useEffect(() => {
        if (!('serviceWorker' in navigator)) return;

        let cleanup;
        navigator.serviceWorker
            // updateViaCache: 'none' stops the browser HTTP cache (on top of the no-cache
            // response header) from ever standing between a check and the real sw.js bytes.
            .register('/sw.js', { updateViaCache: 'none' })
            .then((registration) => {
                cleanup = watchForUpdate(registration);
            })
            .catch((error) => console.warn('Service worker registration failed:', error));

        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            refreshing = true;
            window.location.reload();
        });

        return () => cleanup?.();
    }, []);
}

export default useServiceWorkerUpdate;
