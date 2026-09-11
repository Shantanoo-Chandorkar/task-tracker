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
 * Confirms cascading completion to a task's incomplete subtasks before marking it done.
 *
 * @param {object} props
 * @param {boolean} props.open - Whether the dialog is visible
 * @param {Function} props.onClose - Called when dismissed without confirming
 * @param {object} props.task - The task being marked complete
 * @param {number} props.incompleteCount - Number of incomplete descendants that will also be marked done
 * @param {Function} props.onConfirm - Called when the user confirms the cascade
 */
export default function CompleteTaskDialog({ open, onClose, task, incompleteCount, onConfirm }) {
    if (!task) return null;

    return (
        <AlertDialog
            open={open}
            onOpenChange={(isOpen) => {
                if (!isOpen) onClose();
            }}
        >
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Mark &ldquo;{task.title}&rdquo; complete?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This will also mark {incompleteCount} subtask
                        {incompleteCount !== 1 ? 's' : ''} as done.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onConfirm}>Mark complete</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
