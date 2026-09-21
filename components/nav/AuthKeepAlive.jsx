'use client';

import { useEffect } from 'react';
import { NOT_AUTHENTICATED } from '@/lib/error-codes';
import { GUEST_ERROR_CODES } from '@/lib/guest/guest-error-codes';

const RECHECK_INTERVAL_MS = 20 * 60 * 1000;
// Resume events can fire in bursts (tab switch, unlock, reconnect); one check per minute is plenty
const MIN_GAP_BETWEEN_REFRESHES_MS = 60 * 1000;

/**
 * Refreshes the session cookie in the background so a long-open app stays signed in.
 *
 * @returns {null} Renders nothing.
 */
export default function AuthKeepAlive() {
    useEffect(() => {
        let lastRefreshTimestampMs = Date.now();

        /**
         * Asks the server to refresh the session, and sends the user to /login only if the session has ended.
         *
         * @returns {Promise<void>}
         */
        async function refreshSession() {
            if (Date.now() - lastRefreshTimestampMs < MIN_GAP_BETWEEN_REFRESHES_MS) return;
            lastRefreshTimestampMs = Date.now();

            try {
                const response = await fetch('/api/auth/session', { cache: 'no-store' });
                if (response.status !== 401) return;

                const { code: errorCode } = await response.json();
                if (errorCode === GUEST_ERROR_CODES.SESSION_EXPIRED) window.location.assign('/login?reason=guest-expired');
                else if (errorCode === NOT_AUTHENTICATED) window.location.assign('/login');
            } catch {
                // Offline or server unreachable: the session is untouched, so stay put and retry on the next trigger
            }
        }

        function refreshSessionWhenTabVisible() {
            if (document.visibilityState === 'visible') refreshSession();
        }

        document.addEventListener('visibilitychange', refreshSessionWhenTabVisible);
        window.addEventListener('online', refreshSession);
        const recheckIntervalId = setInterval(refreshSessionWhenTabVisible, RECHECK_INTERVAL_MS);

        return () => {
            document.removeEventListener('visibilitychange', refreshSessionWhenTabVisible);
            window.removeEventListener('online', refreshSession);
            clearInterval(recheckIntervalId);
        };
    }, []);

    return null;
}
