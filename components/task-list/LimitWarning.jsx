'use client';

import { useSyncExternalStore } from 'react';
import { AlertTriangle, X } from 'lucide-react';

const listenersByKey = new Map();

function getListeners(dismissKey) {
    if (!listenersByKey.has(dismissKey)) listenersByKey.set(dismissKey, new Set());
    return listenersByKey.get(dismissKey);
}

function getSnapshot(dismissKey) {
    return sessionStorage.getItem(dismissKey) === 'true';
}

// Start hidden on the server/first paint to avoid a flash before we know the real value.
function getServerSnapshot() {
    return true;
}

function dismiss(dismissKey) {
    sessionStorage.setItem(dismissKey, 'true');
    getListeners(dismissKey).forEach((callback) => callback());
}

/**
 * Amber inline banner warning that a limit has already been exceeded.
 *
 * @param {object} props
 * @param {string} props.message - Warning text shown in the banner
 * @param {boolean} [props.dismissible] - Whether the banner can be dismissed for the session
 * @param {string} [props.dismissKey] - sessionStorage key scoping dismissal - required if dismissible
 */
export default function LimitWarning({ message, dismissible = false, dismissKey }) {
    const dismissed = useSyncExternalStore(
        (callback) => {
            const listeners = getListeners(dismissKey);
            listeners.add(callback);
            return () => listeners.delete(callback);
        },
        () => (dismissKey ? getSnapshot(dismissKey) : false),
        getServerSnapshot,
    );

    if (dismissible && dismissed) return null;

    return (
        <div className="flex items-start gap-2 mx-2 my-1 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/10">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-700 dark:text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-400 flex-1">{message}</p>
            {dismissible && (
                <button
                    onClick={() => dismiss(dismissKey)}
                    className="hit-area text-amber-700 hover:text-amber-900 dark:text-amber-500 dark:hover:text-amber-400 flex-shrink-0"
                    aria-label="Dismiss warning"
                >
                    <X className="h-3 w-3" />
                </button>
            )}
        </div>
    );
}
