'use client';

import { AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import ModalShell from '@/components/custom/ModalShell';
import { Loader } from '@/components/custom/Loader';
import { describeSharingConfirm } from '@/lib/spaces/sharing-confirm-copy';

/**
 * Confirmation popup for rejecting a request, removing a collaborator, or revoking an invite.
 *
 * @param {object} props
 * @param {object} props.sharingConfirm - Result of `useSharingConfirm`
 */
export default function SharingConfirmDialog({ sharingConfirm }) {
    const { confirmTarget, closeConfirm, confirm, isPending, errorMessage } = sharingConfirm;
    const confirmCopy = describeSharingConfirm(confirmTarget);

    return (
        <ModalShell
            open={!!confirmTarget}
            onClose={closeConfirm}
            isBusy={isPending}
            errorMessage={errorMessage}
            variant="alert"
            title={confirmCopy?.title}
            description={confirmCopy?.description}
            footer={
                <>
                    <AlertDialogCancel onClick={closeConfirm} disabled={isPending}>
                        Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                        onClick={confirm}
                        disabled={isPending}
                        className="gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        {isPending && <Loader size="xs" />}
                        {confirmCopy?.confirmLabel}
                    </AlertDialogAction>
                </>
            }
        />
    );
}
