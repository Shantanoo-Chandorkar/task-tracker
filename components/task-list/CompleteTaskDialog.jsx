'use client';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

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
export default function CompleteTaskDialog({ open, onClose, task, isComplete, descendantCount, onConfirm }) {
    if (!task) return null;

    const verb = isComplete ? 'complete' : 'incomplete';

    return (
        <AlertDialog
            open={open}
            onOpenChange={(isOpen) => {
                if (!isOpen) onClose();
            }}
        >
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Mark &ldquo;{task.title}&rdquo; {verb}?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This will also mark {descendantCount} subtask{descendantCount !== 1 ? 's' : ''} as {verb}.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onConfirm}>Mark {verb}</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
