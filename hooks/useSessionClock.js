'use client';

import { useEffect, useState } from 'react';
import { computeElapsedSeconds } from '@/modules/timer/domain/session-clock';

/**
 * Ticks a session's elapsed seconds once a second while running, for a smooth live display.
 * The server's own value always wins on arrival - this is a display convenience, not the source of truth.
 *
 * @param {{ status: string, accumulated_seconds: number, last_resumed_at: string|null }} session
 * @returns {number} The session's current elapsed seconds.
 */
export function useSessionClock(session) {
    const [lastSession, setLastSession] = useState(session);
    const [elapsedSeconds, setElapsedSeconds] = useState(() =>
        computeElapsedSeconds(session, new Date()),
    );

    // Resets on a changed prop during render, not in an effect - React's blessed pattern for this.
    if (session !== lastSession) {
        setLastSession(session);
        setElapsedSeconds(computeElapsedSeconds(session, new Date()));
    }

    useEffect(() => {
        if (session.status !== 'running') return;

        const intervalId = setInterval(() => {
            setElapsedSeconds(computeElapsedSeconds(session, new Date()));
        }, 1000);
        return () => clearInterval(intervalId);
    }, [session]);

    return elapsedSeconds;
}
