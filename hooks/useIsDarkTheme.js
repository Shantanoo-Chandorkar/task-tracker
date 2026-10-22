'use client';

import { useSyncExternalStore } from 'react';

const themeChangeListeners = new Set();

function getIsDarkSnapshot() {
    const stored = localStorage.getItem('theme');
    if (stored === 'light') return false;
    if (stored === 'dark') return true;
    // No stored preference - use system preference, default to dark
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// SSR default, before the blocking init script (layout.js's <head>) sets the real class.
function getServerIsDarkSnapshot() {
    return true;
}

function subscribeToThemeChange(callback) {
    themeChangeListeners.add(callback);
    return () => themeChangeListeners.delete(callback);
}

/**
 * Persists the dark/light preference and notifies every `useIsDarkTheme()` subscriber.
 *
 * @param {boolean} isDark - The preference to store.
 */
export function setStoredTheme(isDark) {
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    themeChangeListeners.forEach((callback) => callback());
}

/**
 * Reports whether the dark theme is active, shared so `ThemeToggle.jsx` and other readers never drift.
 *
 * @returns {boolean} Whether the dark theme is active.
 */
export function useIsDarkTheme() {
    return useSyncExternalStore(subscribeToThemeChange, getIsDarkSnapshot, getServerIsDarkSnapshot);
}
