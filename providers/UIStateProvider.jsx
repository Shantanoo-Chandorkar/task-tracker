'use client';

import { useSyncExternalStore } from 'react';

// Module-level singleton (not React state) so useUIFlag subscribers can skip unrelated toggles.
let flags = {};
const listeners = new Set();

function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function setFlags(next) {
    flags = next;
    listeners.forEach((listener) => listener());
}

/**
 * Toggles a boolean UI flag (expand/collapse state), keyed by caller strings.
 * Keys must be namespaced by callers (e.g. `task-row:${id}`) to avoid collisions.
 *
 * @param {string} key - The flag's namespaced key
 */
export function toggleFlag(key) {
    setFlags({ ...flags, [key]: !flags[key] });
}

/**
 * Sets a boolean UI flag to an explicit value.
 *
 * @param {string} key - The flag's namespaced key
 * @param {boolean} value - The value to set the flag to
 */
export function setFlag(key, value) {
    setFlags({ ...flags, [key]: value });
}

/**
 * Passthrough wrapper - the store is module-level now, so this no longer needs to hold React state.
 *
 * @param {object} props
 * @param {React.ReactNode} props.children - Content to render inside the provider
 */
export function UIStateProvider({ children }) {
    return children;
}

/**
 * Reads/writes the shared UI flag store, subscribed to every key (use `useUIFlag` for just one).
 *
 * @returns {{flags: Object<string, boolean>, toggleFlag: Function, setFlag: Function}}
 */
export function useUIState() {
    const snapshot = useSyncExternalStore(subscribe, () => flags, () => flags);
    return { flags: snapshot, toggleFlag, setFlag };
}

/**
 * Reads a single UI flag, re-rendering only when that specific key changes.
 *
 * @param {string} key - The flag's namespaced key
 * @returns {boolean}
 */
export function useUIFlag(key) {
    return useSyncExternalStore(
        subscribe,
        () => Boolean(flags[key]),
        () => false,
    );
}
