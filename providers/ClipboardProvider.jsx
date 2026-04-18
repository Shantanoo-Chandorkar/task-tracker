'use client';

import { createContext, useContext, useState } from 'react';

const ClipboardContext = createContext(null);

const STORAGE_KEY = 'task_tracker_clipboard';

/**
 * Provides clipboard state for copy/cut/paste operations across the task tree.
 * Persists the full subtree snapshot to localStorage so it survives page refreshes.
 * React state holds the lightweight { mode, taskId } signal used to update UI (e.g. opacity on cut tasks).
 *
 * @param {object} props
 * @param {React.ReactNode} props.children
 */
export function ClipboardProvider({ children }) {
    const [clipboard, setClipboardState] = useState({
        mode: null,
        taskId: null,
        snapshot: null,
    });

    /**
     * Sets the clipboard with a mode ('copy' | 'cut'), the source task ID, and the full subtree snapshot.
     *
     * @param {{ mode: 'copy'|'cut', taskId: string, snapshot: object }} payload
     */
    function setClipboard({ mode, taskId, snapshot }) {
        setClipboardState({ mode, taskId, snapshot });
        if (snapshot) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode, taskId, snapshot }));
        }
    }

    /**
     * Clears the clipboard state and removes the localStorage entry.
     */
    function clearClipboard() {
        setClipboardState({ mode: null, taskId: null, snapshot: null });
        localStorage.removeItem(STORAGE_KEY);
    }

    return (
        <ClipboardContext.Provider value={{ clipboard, setClipboard, clearClipboard }}>
            {children}
        </ClipboardContext.Provider>
    );
}

/**
 * Returns clipboard context. Must be used within a ClipboardProvider.
 *
 * @returns {{ clipboard: object, setClipboard: Function, clearClipboard: Function }}
 */
export function useClipboardContext() {
    const context = useContext(ClipboardContext);
    if (!context) {
        throw new Error('useClipboardContext must be used within a ClipboardProvider');
    }
    return context;
}
