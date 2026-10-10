'use client';

import { AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import ModalShell from '@/components/custom/ModalShell';
import { Loader } from '@/components/custom/Loader';

/**
 * Confirmation popup for deleting a sublist and the tasks inside it.
 *
 * @param {object} props
 * @param {object} props.deletion - Result of `useSublistDeletion`
 */
export default function DeleteSublistDialog({ deletion }) {
    const { deleteTarget, closeDelete, confirmDelete, isPending, errorMessage } = deletion;

    return (
        <ModalShell
            open={!!deleteTarget}
            onClose={closeDelete}
            isBusy={isPending}
            errorMessage={errorMessage}
            variant="alert"
            title={<>Delete &ldquo;{deleteTarget?.name}&rdquo;?</>}
            description={
                deleteTarget?.taskCount != null
                    ? `This deletes ${deleteTarget.taskCount} task${deleteTarget.taskCount !== 1 ? 's' : ''} inside it. This cannot be undone.`
                    : 'This cannot be undone.'
            }
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
                        Delete
                    </AlertDialogAction>
                </>
            }
        />
    );
}
