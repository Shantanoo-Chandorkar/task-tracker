'use client';

import { useSyncExternalStore } from 'react';
import { onlineManager } from '@tanstack/react-query';

function getSnapshot() {
    return onlineManager.isOnline();
}

function getServerSnapshot() {
    return true;
}

/**
 * Tracks live connectivity status via TanStack Query's onlineManager.
 *
 * @returns {boolean} Whether the browser currently reports being online
 */
export function useOnlineStatus() {
    return useSyncExternalStore(onlineManager.subscribe, getSnapshot, getServerSnapshot);
}
