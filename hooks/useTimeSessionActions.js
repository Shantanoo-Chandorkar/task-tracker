'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
    startTimeSession,
    pauseTimeSession,
    resumeTimeSession,
    completeTimeSession,
    discardTimeSession,
    advanceSessionBlock,
} from '@/modules/timer/actions/time-session-actions';
import { createClientId } from '@/lib/client-id';
import { claimInFlight } from '@/lib/in-flight-entities';

const UNREACHABLE_MESSAGE = 'Could not reach the server. Check your connection and try again.';

/**
 * Runs a time-session mutation behind an in-flight guard, same shape as every habit mutation hook.
 *
 * @param {string} entityKey - Stable key for the in-flight guard.
 * @param {string} loadingMessage - Shown while the mutation is pending.
 * @param {() => Promise<Record<string, any>>} action - The server call.
 * @returns {Promise<Record<string, any>|false>} The result, or false when busy, offline, or refused
 *   (already toasted).
 */
async function runTimeSessionAction(entityKey, loadingMessage, action) {
    const releaseInFlight = claimInFlight(entityKey);
    if (!releaseInFlight) return false;

    const toastId = toast.loading(loadingMessage);
    try {
        let actionResult;
        try {
            actionResult = await action();
        } catch {
            toast.error(UNREACHABLE_MESSAGE, { id: toastId });
            return false;
        }

        if (actionResult.error) {
            toast.error(actionResult.error, { id: toastId });
            return false;
        }

        toast.dismiss(toastId);
        return actionResult;
    } finally {
        releaseInFlight();
    }
}

/**
 * Starts, pauses, resumes, completes and discards time sessions.
 * Invalidates the shared query rather than patching the cache by hand - a completion can delete
 * or update the row depending on subject, so a full refetch is the honest cost.
 *
 * @returns {{
 *   start: (fields: object) => Promise<boolean>,
 *   pause: (id: string) => Promise<boolean>,
 *   resume: (id: string) => Promise<boolean>,
 *   complete: (id: string) => Promise<boolean>,
 *   discard: (id: string) => Promise<boolean>,
 *   advanceBlock: (id: string) => Promise<boolean>,
 * }}
 */
export function useTimeSessionActions() {
    const queryClient = useQueryClient();

    const invalidate = useCallback(
        () => queryClient.invalidateQueries({ queryKey: ['time-sessions'] }),
        [queryClient],
    );

    const start = useCallback(
        async (fields) => {
            const startResult = await runTimeSessionAction(
                `time-session-start:${fields.habitId ?? fields.taskId ?? 'standalone'}`,
                'Starting session...',
                () => startTimeSession({ ...fields, id: createClientId() }),
            );
            if (!startResult) return false;
            invalidate();
            return true;
        },
        [invalidate],
    );

    const pause = useCallback(
        async (id) => {
            const pauseResult = await runTimeSessionAction(`time-session:${id}`, 'Pausing...', () =>
                pauseTimeSession(id),
            );
            if (!pauseResult) return false;
            invalidate();
            return true;
        },
        [invalidate],
    );

    const resume = useCallback(
        async (id) => {
            const resumeResult = await runTimeSessionAction(
                `time-session:${id}`,
                'Resuming...',
                () => resumeTimeSession(id),
            );
            if (!resumeResult) return false;
            invalidate();
            return true;
        },
        [invalidate],
    );

    const complete = useCallback(
        async (id) => {
            const completeResult = await runTimeSessionAction(
                `time-session:${id}`,
                'Completing...',
                () => completeTimeSession(id),
            );
            if (!completeResult) return false;
            invalidate();
            return true;
        },
        [invalidate],
    );

    const discard = useCallback(
        async (id) => {
            const discardResult = await runTimeSessionAction(
                `time-session:${id}`,
                'Discarding...',
                () => discardTimeSession(id),
            );
            if (!discardResult) return false;
            invalidate();
            return true;
        },
        [invalidate],
    );

    const advanceBlock = useCallback(
        async (id) => {
            const advanceResult = await runTimeSessionAction(
                `time-session:${id}`,
                'Moving to the next block...',
                () => advanceSessionBlock(id),
            );
            if (!advanceResult) return false;
            invalidate();
            return true;
        },
        [invalidate],
    );

    return { start, pause, resume, complete, discard, advanceBlock };
}
