'use client';

import { AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import ModalShell from '@/components/ui/modal-shell';
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
            <ModalShell
                open={open}
                onClose={onClose}
                variant="alert"
                title={<>Delete &ldquo;{task.title}&rdquo;?</>}
                description="This cannot be undone."
                footer={
                    <>
                        <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => onConfirm('cascade')}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </>
                }
            />
        );
    }

    return (
        <ModalShell
            open={open}
            onClose={onClose}
            variant="alert"
            title={<>Delete &ldquo;{task.title}&rdquo;?</>}
            description={
                <>
                    This task has {directChildren.length} subtask
                    {directChildren.length !== 1 ? 's' : ''}. What should happen to{' '}
                    {directChildren.length !== 1 ? 'them' : 'it'}?
                </>
            }
            footerClassName="flex-col sm:flex-col gap-2"
            footer={
                <>
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
                </>
            }
        />
    );
}
