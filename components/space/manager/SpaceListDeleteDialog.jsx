'use client';

import { AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import ModalShell from '@/components/custom/ModalShell';
import { Loader } from '@/components/custom/Loader';
import { describeDeleteTarget } from '@/lib/spaces/delete-target-copy';

/**
 * Confirmation popup for deleting a space, deleting a list, or leaving a shared space.
 *
 * @param {object} props
 * @param {object} props.deletion - Result of `useSpaceListDeletion`
 */
export default function SpaceListDeleteDialog({ deletion }) {
    const { deleteTarget, closeDelete, confirmDelete, isPending, errorMessage } = deletion;
    const { title, description, confirmLabel } = describeDeleteTarget(deleteTarget);

    return (
        <ModalShell
            open={!!deleteTarget}
            onClose={closeDelete}
            isBusy={isPending}
            errorMessage={errorMessage}
            variant="alert"
            title={title}
            description={description}
            footer={
                <>
                    <AlertDialogCancel onClick={closeDelete} disabled={isPending}>
                        Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                        onClick={confirmDelete}
                        disabled={isPending}
                        className="gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        {isPending && <Loader size="xs" />}
                        {confirmLabel}
                    </AlertDialogAction>
                </>
            }
        />
    );
}
