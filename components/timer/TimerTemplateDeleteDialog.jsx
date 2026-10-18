'use client';

import ModalShell from '@/components/custom/ModalShell';
import { Loader } from '@/components/custom/Loader';
import { AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';

/**
 * Confirm popup for deleting a timer template - sessions that used it just lose the link.
 *
 * @param {object} props
 * @param {boolean} props.open - Whether the popup is open.
 * @param {() => void} props.onClose - Called when the popup should close (cancel, Esc, outside click).
 * @param {() => void} props.onConfirm - Called when Delete is pressed.
 * @param {string} props.templateName - Name shown in the popup title.
 * @param {boolean} props.isPending - Whether the delete is running; locks the popup and shows the spinner.
 * @param {string} [props.errorMessage] - Error from the last attempt, shown inside the popup.
 */
export default function TimerTemplateDeleteDialog({
    open,
    onClose,
    onConfirm,
    templateName,
    isPending,
    errorMessage,
}) {
    return (
        <ModalShell
            open={open}
            onClose={onClose}
            isBusy={isPending}
            errorMessage={errorMessage}
            variant="alert"
            title={<>Delete &ldquo;{templateName}&rdquo;?</>}
            description="Sessions that used this template keep their history and lose the link."
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
                        Delete
                    </AlertDialogAction>
                </>
            }
        />
    );
}
