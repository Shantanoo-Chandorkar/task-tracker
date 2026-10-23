'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/custom/Loader';
import { useTimeSessionActions } from '@/hooks/useTimeSessionActions';
import { cn } from '@/lib/ui/class-names';

const DEFAULT_BUTTON_CLASSES =
    'h-12 grow basis-0 gap-1.5 px-[22px] text-[0.9375rem] md:grow-0 md:basis-auto';

/**
 * Pause/Resume/Complete buttons for one time session - which pair shows depends on `status`.
 * Gains a "Next block" button when the session follows a template and isn't on its last block.
 *
 * @param {object} props
 * @param {object} props.session - The session these controls act on.
 * @param {{ isLastBlock: boolean }|null} [props.blockDisplay] - The session's current block info.
 * @param {string} [props.buttonClassName] - Overrides the default button size, e.g. for fullscreen.
 */
export default function TimerControls({ session, blockDisplay = null, buttonClassName = '' }) {
    const { pause, resume, complete, advanceBlock } = useTimeSessionActions();
    const [pendingAction, setPendingAction] = useState(null);
    const isPending = pendingAction !== null;
    const canAdvanceBlock = blockDisplay && !blockDisplay.isLastBlock;

    async function handlePauseOrResume() {
        setPendingAction('pauseResume');
        try {
            if (session.status === 'running') await pause(session.id);
            else await resume(session.id);
        } finally {
            setPendingAction(null);
        }
    }

    async function handleComplete() {
        setPendingAction('complete');
        try {
            await complete(session.id);
        } finally {
            setPendingAction(null);
        }
    }

    async function handleAdvanceBlock() {
        setPendingAction('advanceBlock');
        try {
            await advanceBlock(session.id);
        } finally {
            setPendingAction(null);
        }
    }

    return (
        <div className="flex items-center gap-2.5 shrink-0">
            <Button
                type="button"
                variant="outline"
                onClick={handlePauseOrResume}
                disabled={isPending}
                className={cn(DEFAULT_BUTTON_CLASSES, buttonClassName)}
            >
                {pendingAction === 'pauseResume' && <Loader size="xs" />}
                {session.status === 'running' ? 'Pause' : 'Resume'}
            </Button>
            {canAdvanceBlock && (
                <Button
                    type="button"
                    variant="outline"
                    onClick={handleAdvanceBlock}
                    disabled={isPending}
                    className={cn(DEFAULT_BUTTON_CLASSES, buttonClassName)}
                >
                    {pendingAction === 'advanceBlock' && <Loader size="xs" />}
                    Next block
                </Button>
            )}
            <Button
                type="button"
                onClick={handleComplete}
                disabled={isPending}
                className={cn(DEFAULT_BUTTON_CLASSES, buttonClassName)}
            >
                {pendingAction === 'complete' && <Loader size="xs" />}
                Complete
            </Button>
        </div>
    );
}
