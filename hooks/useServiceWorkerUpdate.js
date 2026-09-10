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
}

/**
 * Registers `public/sw.js` and prompts (via the shared `sonner` toast) when a new
 * version has finished installing and is waiting to take over.
 */
export function useServiceWorkerUpdate() {
    useEffect(() => {
        if (!('serviceWorker' in navigator)) return;

        navigator.serviceWorker
            .register('/sw.js')
            .then(watchForUpdate)
            .catch((error) => console.warn('Service worker registration failed:', error));

        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            refreshing = true;
            window.location.reload();
        });
    }, []);
}

export default useServiceWorkerUpdate;
