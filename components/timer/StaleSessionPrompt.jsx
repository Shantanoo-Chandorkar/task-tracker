'use client';

import { useState } from 'react';
import ModalShell from '@/components/custom/ModalShell';
import { Loader } from '@/components/custom/Loader';
import { AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { useTimeSessionActions } from '@/hooks/useTimeSessionActions';

/**
 * "You left this running" popup for a stale session: Keep completes it, Discard deletes it outright.
 * Handles the open/pending/error discipline by hand (two actions, not `useConfirmAction`'s one).
 *
 * @param {object} props
 * @param {object} props.session - The stale session.
 */
export default function StaleSessionPrompt({ session }) {
    const { complete, discard } = useTimeSessionActions();
    const [pendingChoice, setPendingChoice] = useState(null);

    async function handleKeep() {
        setPendingChoice('keep');
        try {
            await complete(session.id);
        } finally {
            setPendingChoice(null);
        }
    }

    async function handleDiscard() {
        setPendingChoice('discard');
        try {
            await discard(session.id);
        } finally {
            setPendingChoice(null);
        }
    }

    const isPending = pendingChoice !== null;

    return (
        <ModalShell
            open
            onClose={() => {}}
            isBusy={isPending}
            variant="alert"
            title="You left this running"
            description="This session has been running for over a day. Keep the time it tracked, or discard it?"
            footer={
                <>
                    <AlertDialogCancel onClick={handleDiscard} disabled={isPending}>
                        {pendingChoice === 'discard' && <Loader size="xs" />}
                        Discard
                    </AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleKeep}
                        disabled={isPending}
                        className="gap-1.5"
                    >
                        {pendingChoice === 'keep' && <Loader size="xs" />}
                        Keep
                    </AlertDialogAction>
                </>
            }
        />
    );
}
