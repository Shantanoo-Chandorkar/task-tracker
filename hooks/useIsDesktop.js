'use client';

import { useSyncExternalStore } from 'react';

const DESKTOP_MEDIA_QUERY = '(min-width: 1024px)';

function subscribeToDesktopChange(callback) {
    const mediaQueryList = window.matchMedia(DESKTOP_MEDIA_QUERY);
    mediaQueryList.addEventListener('change', callback);
    return () => mediaQueryList.removeEventListener('change', callback);
}

function getIsDesktopSnapshot() {
    return window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
}

// Mobile-first default so the server-rendered/first-paint shell matches the
// common case before hydration, instead of flashing the desktop layout.
function getIsDesktopServerSnapshot() {
    return false;
}

/**
 * Reports whether the viewport is at or above the `lg` (1024px) breakpoint.
 * Shared by any UI that swaps between a desktop and a mobile presentation
 * (e.g. ResponsiveModal's Dialog/Sheet choice, TaskRowActions' move picker).
 *
 * @returns {boolean} Whether the viewport is desktop-width
 */
export function useIsDesktop() {
    return useSyncExternalStore(
        subscribeToDesktopChange,
        getIsDesktopSnapshot,
        getIsDesktopServerSnapshot,
    );
}
