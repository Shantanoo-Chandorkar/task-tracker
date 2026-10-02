'use client';

import { useState } from 'react';
import { AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import ModalShell from '@/components/ui/modal-shell';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/ui/loader';

/**
 * Confirmation dialog for deleting a task; offers reparent-first or cascade-delete when it has children.
 *
 * @param {object} props
 * @param {boolean} props.open - Whether the dialog is visible
 * @param {Function} props.onClose - Called when the dialog is dismissed without action
 * @param {object} props.task - The task being deleted
 * @param {object[]} props.flatList - Full flat task list, used to detect direct children
 * @param {Function} props.onConfirm - Called with 'cascade' or 'reparent' strategy
 * @param {boolean} [props.isPending] - While true the popup is locked and the chosen button spins
 * @param {string} [props.errorMessage] - Failure text shown inside the popup, which stays open
 */
export default function DeleteTaskDialog({
    open,
    onClose,
    task,
    flatList,
    onConfirm,
    isPending = false,
    errorMessage,
}) {
    const [chosenStrategy, setChosenStrategy] = useState(null);
    if (!task) return null;

    function confirmWith(strategy) {
        setChosenStrategy(strategy);
        return onConfirm(strategy);
    }

    const directChildren = flatList.filter((t) => t.parent_id === task.id);
    const hasChildren = directChildren.length > 0;

    if (!hasChildren) {
        return (
            <ModalShell
                open={open}
                onClose={onClose}
                isBusy={isPending}
                errorMessage={errorMessage}
                variant="alert"
                title={<>Delete &ldquo;{task.title}&rdquo;?</>}
                description="This cannot be undone."
                footer={
                    <>
                        <AlertDialogCancel onClick={onClose} disabled={isPending}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => confirmWith('cascade')}
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

    return (
        <ModalShell
            open={open}
            onClose={onClose}
            isBusy={isPending}
            errorMessage={errorMessage}
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
                        onClick={() => confirmWith('reparent')}
                        disabled={isPending}
                        className="w-full gap-1.5"
                    >
                        {isPending && chosenStrategy === 'reparent' && <Loader size="xs" />}
                        Move subtasks to parent
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={() => confirmWith('cascade')}
                        disabled={isPending}
                        className="w-full gap-1.5"
                    >
                        {isPending && chosenStrategy === 'cascade' && <Loader size="xs" />}
                        Delete everything
                    </Button>
                    <AlertDialogCancel
                        onClick={onClose}
                        disabled={isPending}
                        className="w-full mt-0"
                    >
                        Cancel
                    </AlertDialogCancel>
                </>
            }
        />
    );
}
