'use client';

import { Dialog as DialogPrimitive } from 'radix-ui';
import { Minimize2 } from 'lucide-react';
import { useSessionClock } from '@/hooks/useSessionClock';
import { formatElapsedDuration } from '@/modules/timer/domain/session-clock';
import {
    resolveSessionDisplayLabel,
    resolveSessionBlockDisplay,
} from '@/modules/timer/domain/session-display';
import { Button } from '@/components/ui/button';
import TimerControls from './TimerControls';

const FULLSCREEN_BUTTON_CLASSES = 'h-[3.25rem] md:h-14 md:px-7 md:text-base';

/**
 * A full-viewport takeover for one live session, built on Radix's Dialog for focus trap/Escape.
 *
 * @param {object} props
 * @param {Array<object>} props.sessions - 1-element array, shaped for a future multi-session bucket.
 * @param {() => void} props.onExit - Called on minimize click, Escape, or any other Radix close.
 */
export default function FullscreenTimerOverlay({ sessions, onExit }) {
    const [session] = sessions;
    const elapsedSeconds = useSessionClock(session);
    const blockDisplay = resolveSessionBlockDisplay(session);
    const label = resolveSessionDisplayLabel(session) || 'Untitled session';

    return (
        <DialogPrimitive.Root open onOpenChange={(open) => !open && onExit()}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Content className="fixed inset-x-0 top-0 z-50 flex h-dvh flex-col items-center justify-center gap-6 bg-background px-6 outline-none">
                    <DialogPrimitive.Title className="sr-only">
                        {label} - fullscreen timer
                    </DialogPrimitive.Title>
                    <DialogPrimitive.Description className="sr-only">
                        Press Escape or the minimize button to return to the normal view.
                    </DialogPrimitive.Description>

                    <DialogPrimitive.Close asChild>
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="absolute top-4 right-4 size-9 rounded-full border-border bg-[color-mix(in_srgb,var(--background)_72%,transparent)] backdrop-blur-md backdrop-saturate-150 md:top-5 md:right-5 md:size-10"
                        >
                            <Minimize2 />
                            <span className="sr-only">Minimize, back to normal view</span>
                        </Button>
                    </DialogPrimitive.Close>

                    <div className="max-w-[20rem] truncate text-center text-[0.9375rem] font-medium text-foreground md:max-w-[40rem] md:text-lg">
                        {label}
                    </div>
                    <div className="font-mono text-[6.875rem] font-bold leading-none tabular-nums text-foreground md:text-[11.25rem]">
                        {formatElapsedDuration(elapsedSeconds)}
                    </div>
                    {blockDisplay && (
                        <div className="text-sm text-muted-foreground">
                            Block {blockDisplay.blockIndex + 1} of {blockDisplay.total}:{' '}
                            {blockDisplay.block.label}
                        </div>
                    )}

                    <div className="mt-2 flex w-full max-w-[20rem] gap-2.5 md:w-auto md:max-w-none md:gap-3.5">
                        <TimerControls
                            session={session}
                            blockDisplay={blockDisplay}
                            buttonClassName={FULLSCREEN_BUTTON_CLASSES}
                        />
                    </div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}
