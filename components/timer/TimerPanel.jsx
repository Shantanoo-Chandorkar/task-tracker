'use client';

import { Maximize2 } from 'lucide-react';
import { useSessionClock } from '@/hooks/useSessionClock';
import { formatElapsedDuration } from '@/modules/timer/domain/session-clock';
import {
    resolveSessionDisplayLabel,
    resolveSessionBlockDisplay,
} from '@/modules/timer/domain/session-display';
import { Button } from '@/components/ui/button';
import TimerControls from './TimerControls';

/**
 * One live session: its label, elapsed time, current block (if templated), and its controls.
 *
 * @param {object} props
 * @param {object} props.session - The session to show.
 * @param {() => void} [props.onEnterFullscreen] - Shows the fullscreen trigger when given.
 */
export default function TimerPanel({ session, onEnterFullscreen }) {
    const elapsedSeconds = useSessionClock(session);
    const blockDisplay = resolveSessionBlockDisplay(session);

    return (
        <div className="flex flex-col items-stretch justify-between gap-3.5 rounded-lg border border-field p-5 md:flex-row md:items-center md:gap-5 md:p-6">
            <div className="min-w-0">
                <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1 truncate text-sm font-medium text-foreground md:text-[0.9375rem]">
                        {resolveSessionDisplayLabel(session) || 'Untitled session'}
                    </div>
                    {onEnterFullscreen && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={onEnterFullscreen}
                            className="flex-shrink-0"
                        >
                            <Maximize2 />
                            <span className="sr-only">View fullscreen</span>
                        </Button>
                    )}
                </div>
                <div className="mt-0.5 font-mono text-[4rem] font-bold leading-[1.05] tabular-nums text-foreground md:mt-1 md:text-[4.5rem]">
                    {formatElapsedDuration(elapsedSeconds)}
                </div>
                {blockDisplay && (
                    <div className="mt-1.5 truncate text-xs text-muted-foreground">
                        Block {blockDisplay.blockIndex + 1} of {blockDisplay.total}:{' '}
                        {blockDisplay.block.label}
                    </div>
                )}
            </div>
            <TimerControls session={session} blockDisplay={blockDisplay} />
        </div>
    );
}
