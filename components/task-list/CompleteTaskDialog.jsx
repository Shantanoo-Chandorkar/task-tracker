'use client';

import { AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import ModalShell from '@/components/ui/modal-shell';

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
 */
export default function CompleteTaskDialog({
    open,
    onClose,
    task,
    isComplete,
    descendantCount,
    onConfirm,
}) {
    if (!task) return null;

    const verb = isComplete ? 'complete' : 'incomplete';

    return (
        <ModalShell
            open={open}
            onClose={onClose}
            variant="alert"
            title={
                <>
                    Mark &ldquo;{task.title}&rdquo; {verb}?
                </>
            }
            description={`This will also mark ${descendantCount} subtask${descendantCount !== 1 ? 's' : ''} as ${verb}.`}
            footer={
                <>
                    <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onConfirm}>Mark {verb}</AlertDialogAction>
                </>
            }
        />
    );
}
