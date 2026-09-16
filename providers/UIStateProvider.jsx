'use client';

import { createContext, useCallback, useContext, useState } from 'react';

const UIStateContext = createContext(null);

/**
 * Shared client-only store of boolean UI flags (expand/collapse state), keyed by caller strings.
 * Mounted once in the root layout, so it survives SPA route changes but resets on hard refresh.
 *
 * @param {object} props
 * @param {React.ReactNode} props.children
 */
export function UIStateProvider({ children }) {
    const [flags, setFlags] = useState({});

    const toggleFlag = useCallback((key) => {
        setFlags((prev) => ({ ...prev, [key]: !prev[key] }));
    }, []);

    const setFlag = useCallback((key, value) => {
        setFlags((prev) => ({ ...prev, [key]: value }));
    }, []);

    return (
        <UIStateContext.Provider value={{ flags, toggleFlag, setFlag }}>
            {children}
        </UIStateContext.Provider>
    );
}

/**
 * Reads/writes the shared UI flag store.
 * Keys must be namespaced by callers (e.g. `task-row:${id}`) to avoid collisions.
 *
 * @returns {{flags: Object<string, boolean>, toggleFlag: Function, setFlag: Function}}
 */
export function useUIState() {
    const context = useContext(UIStateContext);
    if (!context) throw new Error('useUIState must be used within UIStateProvider');
    return context;
}
