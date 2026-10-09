'use client';

import ModalShell from '@/components/custom/ModalShell';
import { Loader } from '@/components/custom/Loader';
import { AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';

/**
 * Confirm popup for deleting something, with the pending spinner and inline error of `useConfirmAction`.
 *
 * @param {object} props
 * @param {boolean} props.open - Whether the popup is open
 * @param {() => void} props.onClose - Called when the popup should close (cancel, Esc, outside click)
 * @param {() => void} props.onConfirm - Called when Delete is pressed
 * @param {import('react').ReactNode} props.title - Question shown as the popup title
 * @param {string} props.description - What the delete will do
 * @param {boolean} props.isPending - Whether the delete is running; locks the popup and shows the spinner
 * @param {string} [props.errorMessage] - Error from the last attempt, shown inside the popup
 * @param {string} [props.confirmLabel] - Text of the confirm button, "Delete" by default
 */
export default function LabelDeleteDialog({
    open,
    onClose,
    onConfirm,
    title,
    description,
    isPending,
    errorMessage,
    confirmLabel = 'Delete',
}) {
    return (
        <ModalShell
            open={open}
            onClose={onClose}
            isBusy={isPending}
            errorMessage={errorMessage}
            variant="alert"
            title={title}
            description={description}
            footer={
                <>
                    <AlertDialogCancel onClick={onClose} disabled={isPending}>
                        Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                        onClick={onConfirm}
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
