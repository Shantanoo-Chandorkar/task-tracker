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
import { Button } from '@/components/ui/button';

/**
 * Confirmation dialog for deleting a task; offers reparent-first or cascade-delete when it has children.
 *
 * @param {object} props
 * @param {boolean} props.open - Whether the dialog is visible
 * @param {Function} props.onClose - Called when the dialog is dismissed without action
 * @param {object} props.task - The task being deleted
 * @param {object[]} props.flatList - Full flat task list, used to detect direct children
 * @param {Function} props.onConfirm - Called with 'cascade' or 'reparent' strategy
 */
export default function DeleteTaskDialog({ open, onClose, task, flatList, onConfirm }) {
    if (!task) return null;

    const directChildren = flatList.filter((t) => t.parent_id === task.id);
    const hasChildren = directChildren.length > 0;

    if (!hasChildren) {
        return (
            <AlertDialog
                open={open}
                onOpenChange={(isOpen) => {
                    if (!isOpen) onClose();
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete &ldquo;{task.title}&rdquo;?</AlertDialogTitle>
                        <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => onConfirm('cascade')}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        );
    }

    return (
        <AlertDialog
            open={open}
            onOpenChange={(isOpen) => {
                if (!isOpen) onClose();
            }}
        >
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Delete &ldquo;{task.title}&rdquo;?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This task has {directChildren.length} subtask
                        {directChildren.length !== 1 ? 's' : ''}. What should happen to{' '}
                        {directChildren.length !== 1 ? 'them' : 'it'}?
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-col sm:flex-col gap-2">
                    <Button
                        variant="outline"
                        onClick={() => onConfirm('reparent')}
                        className="w-full"
                    >
                        Move subtasks to parent
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={() => onConfirm('cascade')}
                        className="w-full"
                    >
                        Delete everything
                    </Button>
                    <AlertDialogCancel onClick={onClose} className="w-full mt-0">
                        Cancel
                    </AlertDialogCancel>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
