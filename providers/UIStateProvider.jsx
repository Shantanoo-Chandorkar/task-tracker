'use client';

import { useMemo, useSyncExternalStore } from 'react';

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
 * Reads a fixed set of UI flags, re-rendering only when one of those keys changes, not any other flag.
 *
 * @param {string[]} keys - The flags' namespaced keys; pass a memoized array so the result stays stable.
 * @returns {Object<string, boolean>} Each key mapped to its current value.
 */
export function useUIFlags(keys) {
    // A string snapshot compares by value, so unrelated flag changes leave it equal and skip the render
    const flagStatesSignature = useSyncExternalStore(
        subscribe,
        () => keys.map((key) => (flags[key] ? '1' : '0')).join(''),
        () => '0'.repeat(keys.length),
    );

    return useMemo(
        () =>
            Object.fromEntries(
                keys.map((key, keyIndex) => [key, flagStatesSignature[keyIndex] === '1']),
            ),
        [keys, flagStatesSignature],
    );
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
