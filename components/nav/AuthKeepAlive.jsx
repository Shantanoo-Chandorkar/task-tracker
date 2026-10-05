'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { clearAllCaches } from '@/lib/cache';
import { NOT_AUTHENTICATED } from '@/lib/error-codes';
import { GUEST_ERROR_CODES } from '@/lib/guest/guest-error-codes';

const RECHECK_INTERVAL_MS = 20 * 60 * 1000;
// Resume events can fire in bursts (tab switch, unlock, reconnect); one check per minute is plenty
const MIN_GAP_BETWEEN_REFRESHES_MS = 60 * 1000;

/**
 * Maps the session endpoint's 401 code to the login page to send the user to.
 *
 * @param {string|undefined} errorCode - `code` from the 401 response body.
 * @returns {string|null} Login path, or null when the code does not mean the session has ended.
 */
function loginPathForEndedSession(errorCode) {
    if (errorCode === GUEST_ERROR_CODES.SESSION_EXPIRED) return '/login?reason=guest-expired';
    if (errorCode === NOT_AUTHENTICATED) return '/login';
    return null;
}

/**
 * Refreshes the session cookie in the background so a long-open app stays signed in.
 *
 * @returns {null} Renders nothing.
 */
export default function AuthKeepAlive() {
    const queryClient = useQueryClient();

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
                const loginPath = loginPathForEndedSession(errorCode);
                if (!loginPath) return;

                // Shared device: the ended session's cached task data must not stay readable
                await clearAllCaches(queryClient);
                window.location.assign(loginPath);
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
    }, [queryClient]);

    return null;
}
