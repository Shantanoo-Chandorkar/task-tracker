'use client';

import { AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import ModalShell from '@/components/custom/ModalShell';
import { Loader } from '@/components/custom/Loader';

/**
 * Confirms cascading a task's complete/incomplete status to its descendants before applying it.
 *
 * @param {object} props
 * @param {boolean} props.open - Whether the dialog is visible
 * @param {Function} props.onClose - Called when dismissed without confirming
 * @param {object} props.task - The task whose status is changing
 * @param {boolean} props.isComplete - Whether this is a complete (true) or incomplete (false) cascade
 * @param {number} props.descendantCount - Number of descendants that will also change status
 * @param {Function} props.onConfirm - Called when the user confirms the cascade
 * @param {boolean} [props.isPending] - While true the popup is locked and the confirm button spins
 * @param {string} [props.errorMessage] - Failure text shown inside the popup, which stays open
 */
export default function CompleteTaskDialog({
    open,
    onClose,
    task,
    isComplete,
    descendantCount,
    onConfirm,
    isPending = false,
    errorMessage,
}) {
    if (!task) return null;

    const verb = isComplete ? 'complete' : 'incomplete';

    return (
        <ModalShell
            open={open}
            onClose={onClose}
            isBusy={isPending}
            errorMessage={errorMessage}
            variant="alert"
            title={
                <>
                    Mark &ldquo;{task.title}&rdquo; {verb}?
                </>
            }
            description={`This will also mark ${descendantCount} subtask${descendantCount !== 1 ? 's' : ''} as ${verb}.`}
            footer={
                <>
                    <AlertDialogCancel onClick={onClose} disabled={isPending}>
                        Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction onClick={onConfirm} disabled={isPending} className="gap-1.5">
                        {isPending && <Loader size="xs" />}
                        Mark {verb}
                    </AlertDialogAction>
                </>
            }
        />
    );
}
