'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNowStrict } from 'date-fns';
import { useConfirmAction } from '@/hooks/useConfirmAction';
import { removeRowFromCache } from '@/lib/cache/query-cache';
import { revokePasskeyAction } from '@/actions/webauthn-actions';
import { AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/custom/Loader';
import ModalShell from '@/components/custom/ModalShell';

const PASSKEYS_QUERY_KEY = ['webauthn-passkeys'];

/**
 * Describes when a passkey was added and last used, in plain relative time.
 *
 * @param {object} passkey - Row with `created_at` and `last_used_at`.
 * @returns {string} e.g. "Added 3 days ago · Last used yesterday" or "...never used".
 */
function describePasskeyAge(passkey) {
    const addedText = `Added ${formatDistanceToNowStrict(new Date(passkey.created_at), { addSuffix: true })}`;
    const usedText = passkey.last_used_at
        ? `Last used ${formatDistanceToNowStrict(new Date(passkey.last_used_at), { addSuffix: true })}`
        : 'Never used yet';
    return `${addedText} · ${usedText}`;
}

/**
 * One registered passkey: its device label, age, and a remove button with a confirm popup.
 *
 * @param {object} props
 * @param {object} props.passkey - Row from `listPasskeysAction` (`id`, `device_label`, `created_at`, `last_used_at`).
 */
export default function PasskeyRow({ passkey }) {
    const queryClient = useQueryClient();
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const { isPending, errorMessage, runConfirmedAction } = useConfirmAction(isConfirmOpen);

    function handleRevoke() {
        return runConfirmedAction({
            entityKey: `webauthn-revoke:${passkey.id}`,
            loadingMessage: 'Removing passkey...',
            successMessage: 'Passkey removed',
            action: () => revokePasskeyAction({ passkeyId: passkey.id }),
            onSuccess: () => {
                removeRowFromCache(queryClient, PASSKEYS_QUERY_KEY, passkey.id);
                queryClient.invalidateQueries({ queryKey: PASSKEYS_QUERY_KEY });
            },
            close: () => setIsConfirmOpen(false),
        });
    }

    return (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-card px-3 py-2.5">
            <div className="min-w-0">
                <p className="truncate text-sm text-foreground">{passkey.device_label}</p>
                <p className="truncate text-xs text-muted-foreground">
                    {describePasskeyAge(passkey)}
                </p>
            </div>
            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsConfirmOpen(true)}
            >
                Remove passkey
            </Button>

            <ModalShell
                open={isConfirmOpen}
                onClose={() => setIsConfirmOpen(false)}
                isBusy={isPending}
                errorMessage={errorMessage}
                variant="alert"
                title={<>Remove &ldquo;{passkey.device_label}&rdquo;?</>}
                description="You'll need your password to log in on this device next time."
                footer={
                    <>
                        <AlertDialogCancel
                            onClick={() => setIsConfirmOpen(false)}
                            disabled={isPending}
                        >
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleRevoke}
                            disabled={isPending}
                            className="gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {isPending && <Loader size="xs" />}
                            Remove
                        </AlertDialogAction>
                    </>
                }
            />
        </div>
    );
}
