'use client';

import { useSessionClock } from '@/hooks/useSessionClock';
import { formatElapsedDuration } from '@/modules/timer/domain/session-clock';
import {
    resolveSessionDisplayLabel,
    resolveSessionBlockDisplay,
} from '@/modules/timer/domain/session-display';
import TimerControls from './TimerControls';

/**
 * One live session: its label, a ticking elapsed-time display, its current block (if templated),
 * and its controls.
 *
 * @param {object} props
 * @param {object} props.session - The session to show.
 */
export default function TimerPanel({ session }) {
    const elapsedSeconds = useSessionClock(session);
    const blockDisplay = resolveSessionBlockDisplay(session);

    return (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-field p-4">
            <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">
                    {resolveSessionDisplayLabel(session) || 'Untitled session'}
                </div>
                <div className="font-mono text-2xl font-semibold tabular-nums text-foreground">
                    {formatElapsedDuration(elapsedSeconds)}
                </div>
                {blockDisplay && (
                    <div className="truncate text-xs text-muted-foreground">
                        Block {blockDisplay.blockIndex + 1} of {blockDisplay.total}:{' '}
                        {blockDisplay.block.label}
                    </div>
                )}
            </div>
            <TimerControls session={session} blockDisplay={blockDisplay} />
        </div>
    );
}
