'use client';

import { useSyncExternalStore } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, X } from 'lucide-react';

const DISMISSED_KEY = 'depth_warning_dismissed';
const listeners = new Set();

function getSnapshot() {
    return sessionStorage.getItem(DISMISSED_KEY) === 'true';
}

// Start hidden on the server/first paint to avoid a flash before we know the real value.
function getServerSnapshot() {
    return true;
}

function subscribe(callback) {
    listeners.add(callback);
    return () => listeners.delete(callback);
}

function dismiss() {
    sessionStorage.setItem(DISMISSED_KEY, 'true');
    listeners.forEach((callback) => callback());
}

/**
 * Amber warning banner shown when tasks reach 4+ levels of nesting.
 * Dismissable per browser session via sessionStorage so it doesn't
 * nag the user every time they look at the same deep task.
 */
export default function DepthWarning() {
    const dismissed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    if (dismissed) return null;

    function handleDismiss() {
        dismiss();
    }

    return (
        <div className="flex items-start gap-2 mx-2 my-1 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/10">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-400 flex-1">
                Tasks are 4+ levels deep. Consider breaking this into separate top-level tasks for
                clarity.
            </p>
            <button
                onClick={handleDismiss}
                className="text-amber-500/70 hover:text-amber-400 flex-shrink-0"
                aria-label="Dismiss depth warning"
            >
                <X className="h-3 w-3" />
            </button>
        </div>
    );
}
