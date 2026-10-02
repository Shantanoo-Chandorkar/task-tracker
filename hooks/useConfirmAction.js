'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { claimInFlight } from '@/lib/in-flight-entities';

const UNREACHABLE_MESSAGE = 'Could not reach the server. Check your connection and try again.';

/**
 * Runs the work behind a confirm popup: spinner state, loading toast, inline error, and close only when finished.
 *
 * @param {boolean} isOpen - Whether the popup is open; opening it clears any previous pending state or error.
 * @returns {{
 *   isPending: boolean,
 *   errorMessage: string,
 *   runConfirmedAction: (options: object) => Promise<boolean>,
 * }} `runConfirmedAction({ entityKey, loadingMessage, successMessage, action, onSuccess, close })`: true on success.
 *   `action` is the server call, `onSuccess` makes the screen final (cache patch or awaited reload) and `close`
 *   closes the popup after that. `successMessage` may be a function of the action result.
 */
export function useConfirmAction(isOpen) {
    const [isPending, setIsPending] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    // Not reset on success, because the popup is still fading out; the next open starts clean.
    const [wasOpen, setWasOpen] = useState(isOpen);
    if (isOpen !== wasOpen) {
        setWasOpen(isOpen);
        if (isOpen) {
            setIsPending(false);
            setErrorMessage('');
        }
    }

    const runConfirmedAction = useCallback(
        async ({ entityKey, loadingMessage, successMessage, action, onSuccess, close }) => {
            const releaseInFlight = claimInFlight(entityKey);
            if (!releaseInFlight) return false;

            setIsPending(true);
            setErrorMessage('');
            const toastId = toast.loading(loadingMessage);

            try {
                let actionResult;
                try {
                    actionResult = await action();
                } catch {
                    toast.dismiss(toastId);
                    setErrorMessage(UNREACHABLE_MESSAGE);
                    setIsPending(false);
                    return false;
                }

                if (actionResult?.error) {
                    toast.dismiss(toastId);
                    setErrorMessage(actionResult.error);
                    setIsPending(false);
                    return false;
                }

                await onSuccess?.(actionResult);
                const message =
                    typeof successMessage === 'function'
                        ? successMessage(actionResult)
                        : successMessage;
                toast.success(message, { id: toastId });
                close();
                return true;
            } finally {
                releaseInFlight();
            }
        },
        [],
    );

    return { isPending, errorMessage, runConfirmedAction };
}
