'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/ui/loader';
import { MoreHorizontal } from 'lucide-react';
import { deleteTask, deleteTaskAndReparentChildren } from '@/actions/task-actions';
import { useClipboard } from '@/hooks/useClipboard';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { findAncestors, findDescendantIds } from '@/lib/tree';
import TaskFormDialog from '@/components/task-form/TaskFormDialog';
import DeleteTaskDialog from '@/components/task-list/DeleteTaskDialog';
import MoveDestinationList from '@/components/task-list/MoveDestinationList';

/**
 * Action bar for a task row — a single, always-visible `···` dropdown with
 * the full action set (edit, delete, add subtask, copy/cut/paste, promote,
 * move to).
 *
 * @param {object} props
 * @param {object} props.task - The task this action bar belongs to
 * @param {object[]} props.flatList - Full flat list for move/promote/delete lookups
 * @param {Function} props.onAddSubtask - Called when "Add Subtask" is selected
 * @param {string} props.listId - The list this task belongs to (for paste target scoping)
 * @param {Function} [props.onDeleted] - Called after a successful delete, in addition to the
 *   query invalidation — lets a page showing only this task (e.g. its own detail page) navigate away
 */
export default function TaskRowActions({ task, flatList, onAddSubtask, listId, onDeleted }) {
    const queryClient = useQueryClient();
    const { clipboard, copyTask, cutTask, pasteTask } = useClipboard();
    const [editOpen, setEditOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [moveSheetOpen, setMoveSheetOpen] = useState(false);
    const [pending, setPending] = useState(false);
    const isDesktop = useIsDesktop();

    const parent = flatList.find((flatTask) => flatTask.id === task.parent_id);
    const grandparentId = parent?.parent_id ?? null;
    const canPromote = Boolean(task.parent_id);
    const hasPaste = Boolean(clipboard.mode && clipboard.taskId);

    // All tasks that are valid reparent destinations:
    // exclude the task itself, its current parent (already there), and any descendants (cycle)
    const descendantIds = findDescendantIds(task.id, flatList);
    const validTargets = flatList
        .filter(
            (flatTask) =>
                flatTask.id !== task.id &&
                flatTask.id !== task.parent_id &&
                !descendantIds.has(flatTask.id),
        )
        .sort((a, b) => a.depth - b.depth || a.title.localeCompare(b.title));

    /**
     * Builds a breadcrumb label for a target task so duplicate titles are unambiguous.
     * e.g. "Project › Design › Wireframes"
     *
     * @param {object} target - Task to build a breadcrumb for
     * @returns {string} Breadcrumb-style label
     */
    function getBreadcrumb(target) {
        const ancestors = findAncestors(target.id, flatList).reverse();
        return [...ancestors.map((ancestor) => ancestor.title), target.title].join(' › ');
    }

    const moveDestinations = validTargets.map((target) => ({
        id: target.id,
        label: getBreadcrumb(target),
    }));

    async function handleDeleteConfirm(strategy) {
        setDeleteOpen(false);
        setPending(true);
        const toastId = toast.loading('Deleting task...');
        const { error } =
            strategy === 'reparent'
                ? await deleteTaskAndReparentChildren(task.id)
                : await deleteTask(task.id);
        setPending(false);

        if (error) {
            toast.error(error, { id: toastId });
            return;
        }

        await queryClient.invalidateQueries({ queryKey: ['tasks'] });
        toast.success('Task deleted', { id: toastId });
        onDeleted?.();
    }

    async function handlePromote() {
        setPending(true);
        const toastId = toast.loading('Moving task...');
        const response = await fetch(`/api/tasks/${task.id}/move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                newParentId: grandparentId,
                afterSiblingId: task.parent_id,
                listId,
            }),
        });
        setPending(false);

        if (!response.ok) {
            toast.error('Failed to move task', { id: toastId });
            return;
        }

        await queryClient.invalidateQueries({ queryKey: ['tasks'] });
        toast.success('Task moved', { id: toastId });
    }

    async function handleMoveTo(targetId) {
        setPending(true);
        const toastId = toast.loading('Moving task...');
        const response = await fetch(`/api/tasks/${task.id}/move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newParentId: targetId, afterSiblingId: null, listId }),
        });
        setPending(false);

        if (!response.ok) {
            toast.error('Failed to move task', { id: toastId });
            return;
        }

        await queryClient.invalidateQueries({ queryKey: ['tasks'] });
        toast.success('Task moved', { id: toastId });
    }

    async function handlePaste() {
        setPending(true);
        const toastId = toast.loading('Pasting task...');
        // pasteTask already surfaces its own error toast on failure — just
        // clear the loading toast here rather than claiming a false success.
        await pasteTask(task.id, queryClient, listId);
        toast.dismiss(toastId);
        setPending(false);
    }

    return (
        <>
            {/* Edit/Delete live only in the ··· menu below — no point duplicating them as
                standalone icons next to it. Always visible (no hover to reveal it on mobile). */}
            <div className="flex items-center gap-0.5 flex-shrink-0">
                {/* ··· context menu */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            disabled={pending}
                            aria-label="More actions"
                        >
                            {pending ? (
                                <Loader size="xs" />
                            ) : (
                                <MoreHorizontal className="h-3 w-3" />
                            )}
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-40">
                        <DropdownMenuItem onClick={() => setEditOpen(true)}>Edit</DropdownMenuItem>
                        <DropdownMenuItem onClick={onAddSubtask}>Add Subtask</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => copyTask(task.id, flatList)}>
                            Copy
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => cutTask(task.id, flatList)}>
                            Cut
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={handlePaste}
                            disabled={!hasPaste}
                            className={!hasPaste ? 'opacity-40' : ''}
                        >
                            Paste here
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />

                        {/* Promote — only for non-root tasks */}
                        {canPromote && (
                            <DropdownMenuItem onClick={handlePromote}>
                                Promote to sibling
                            </DropdownMenuItem>
                        )}

                        {/* Move to — shows all valid reparent destinations with breadcrumb paths.
                            A nested flyout has no room to render on mobile widths, so it opens
                            a bottom Sheet there instead; desktop keeps the flyout. */}
                        {validTargets.length > 0 &&
                            (isDesktop ? (
                                <DropdownMenuSub>
                                    <DropdownMenuSubTrigger>Move to...</DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
                                        {validTargets.map((target) => (
                                            <DropdownMenuItem
                                                key={target.id}
                                                onClick={() => handleMoveTo(target.id)}
                                            >
                                                {getBreadcrumb(target)}
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuSubContent>
                                </DropdownMenuSub>
                            ) : (
                                <DropdownMenuItem onClick={() => setMoveSheetOpen(true)}>
                                    Move to...
                                </DropdownMenuItem>
                            ))}

                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={() => setDeleteOpen(true)}
                            className="text-destructive focus:text-destructive"
                        >
                            Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Edit dialog */}
            <TaskFormDialog open={editOpen} onClose={() => setEditOpen(false)} task={task} />

            {/* Delete confirmation dialog */}
            <DeleteTaskDialog
                open={deleteOpen}
                onClose={() => setDeleteOpen(false)}
                task={task}
                flatList={flatList}
                onConfirm={handleDeleteConfirm}
            />

            {/* Move-to destination picker — mobile only; desktop uses the DropdownMenuSub flyout above */}
            <Sheet open={moveSheetOpen} onOpenChange={(open) => !open && setMoveSheetOpen(false)}>
                <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto">
                    <SheetHeader>
                        <SheetTitle>Move to...</SheetTitle>
                    </SheetHeader>
                    <MoveDestinationList
                        destinations={moveDestinations}
                        onSelect={(targetId) => {
                            setMoveSheetOpen(false);
                            handleMoveTo(targetId);
                        }}
                    />
                </SheetContent>
            </Sheet>
        </>
    );
}
