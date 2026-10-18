'use client';

import { useSessionClock } from '@/hooks/useSessionClock';
import { formatElapsedDuration } from '@/modules/timer/domain/session-clock';
import TimerControls from './TimerControls';

/**
 * One live session: its label, a ticking elapsed-time display, and its controls.
 *
 * @param {object} props
 * @param {object} props.session - The session to show.
 */
export default function TimerPanel({ session }) {
    const elapsedSeconds = useSessionClock(session);

    return (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-field p-4">
            <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">
                    {session.label || 'Untitled session'}
                </div>
                <div className="font-mono text-2xl font-semibold tabular-nums text-foreground">
                    {formatElapsedDuration(elapsedSeconds)}
                </div>
            </div>
            <TimerControls session={session} />
        </div>
    );
}
