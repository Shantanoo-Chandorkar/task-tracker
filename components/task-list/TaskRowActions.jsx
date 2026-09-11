'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/ui/loader';
import { MoreHorizontal } from 'lucide-react';
import { updateTask, completeTaskAndDescendants, duplicateTask } from '@/actions/task-actions';
import { enqueueOrRun } from '@/lib/offline-queue';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { findAncestors, findDescendantIds, findIncompleteDescendants } from '@/lib/tree';
import TaskFormDialog from '@/components/task-form/TaskFormDialog';
import DeleteTaskDialog from '@/components/task-list/DeleteTaskDialog';
import CompleteTaskDialog from '@/components/task-list/CompleteTaskDialog';
import MoveDestinationList from '@/components/task-list/MoveDestinationList';

/**
 * Action bar for a task row — a single, always-visible `···` dropdown with
 * the full action set (edit, delete, add subtask, duplicate, promote,
 * move to).
 *
 * @param {object} props
 * @param {object} props.task - The task this action bar belongs to
 * @param {object[]} props.flatList - Full flat list for move/promote/delete lookups
 * @param {Function} props.onAddSubtask - Called when "Add Subtask" is selected
 * @param {boolean} [props.canAddSubtask] - Whether depth allows a subtask; default true
 * @param {string} props.listId - The list this task belongs to
 * @param {Function} [props.onDeleted] - Called after delete, so a task's own detail page can navigate away
 */
export default function TaskRowActions({
    task,
    flatList,
    onAddSubtask,
    canAddSubtask = true,
    listId,
    onDeleted,
}) {
    const queryClient = useQueryClient();
    const [editOpen, setEditOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [completeConfirmOpen, setCompleteConfirmOpen] = useState(false);
    const [moveSheetOpen, setMoveSheetOpen] = useState(false);
    const [pending, setPending] = useState(false);
    const isDesktop = useIsDesktop();
    const isRootTask = !task.parent_id;

    const { data: sublists = [] } = useQuery({
        queryKey: ['sublists', listId],
        queryFn: async () => {
            const response = await fetch(`/api/sublists?list_id=${listId}`);
            if (!response.ok) throw new Error('Failed to fetch sublists');
            return response.json();
        },
        enabled: isRootTask,
    });

    const { data: statuses = [] } = useQuery({
        queryKey: ['statuses'],
        queryFn: async () => {
            const response = await fetch('/api/statuses');
            if (!response.ok) throw new Error('Failed to fetch statuses');
            return response.json();
        },
    });

    const doneStatus = statuses.find((status) => status.code === 'done');
    const defaultStatus = statuses.find((status) => status.is_default);
    const isDone = task.status_id === doneStatus?.id;
    const incompleteDescendants = doneStatus
        ? findIncompleteDescendants(task.id, flatList, doneStatus.id)
        : [];

    const parent = flatList.find((flatTask) => flatTask.id === task.parent_id);
    const grandparentId = parent?.parent_id ?? null;
    const canPromote = Boolean(task.parent_id);

    // Valid reparent targets exclude the task itself, its current parent, and any descendants (cycle).
    const descendantIds = findDescendantIds(task.id, flatList);
    const validTargets = flatList
        .filter(
            (flatTask) =>
                flatTask.id !== task.id &&
                flatTask.id !== task.parent_id &&
                !descendantIds.has(flatTask.id),
        )
        .sort((taskA, taskB) => taskA.depth - taskB.depth || taskA.title.localeCompare(taskB.title));

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

        // Optimistic removal — mirrors the DB cascade for plain delete. For the
        // reparent strategy, children are hidden too until the sync confirms the
        // real reparent; they reappear correctly once that lands.
        const queryKey = ['tasks', listId];
        const previousTasks = queryClient.getQueryData(queryKey);
        const idsToRemove = new Set([task.id, ...findDescendantIds(task.id, flatList)]);
        queryClient.setQueryData(queryKey, (current) =>
            current?.filter((existingTask) => !idsToRemove.has(existingTask.id)),
        );

        const mutationType = strategy === 'reparent' ? 'deleteTaskAndReparentChildren' : 'deleteTask';
        const { error, queued } = await enqueueOrRun(mutationType, { taskId: task.id });
        setPending(false);

        if (error) {
            queryClient.setQueryData(queryKey, previousTasks);
            toast.error(error, { id: toastId });
            return;
        }

        if (queued) {
            toast.success("Deleted — will sync when you're back online", { id: toastId });
        } else {
            await queryClient.invalidateQueries({ queryKey: ['tasks'] });
            toast.success('Task deleted', { id: toastId });
        }
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

    async function handleMoveToSublist(targetSublistId) {
        setPending(true);
        const toastId = toast.loading('Moving task...');
        const response = await fetch(`/api/tasks/${task.id}/move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                newParentId: null,
                sublistId: targetSublistId,
                afterSiblingId: null,
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

    async function handleToggleComplete() {
        if (!isDone && incompleteDescendants.length > 0) {
            setCompleteConfirmOpen(true);
            return;
        }

        const targetStatus = isDone ? defaultStatus : doneStatus;
        if (!targetStatus) return;

        setPending(true);
        const toastId = toast.loading(isDone ? 'Marking incomplete...' : 'Marking complete...');
        const { error } = await updateTask(task.id, { status_id: targetStatus.id });
        setPending(false);

        if (error) {
            toast.error(error, { id: toastId });
            return;
        }

        await queryClient.invalidateQueries({ queryKey: ['tasks'] });
        toast.dismiss(toastId);
    }

    async function handleCascadeComplete() {
        setCompleteConfirmOpen(false);
        setPending(true);
        const toastId = toast.loading('Marking complete...');
        const { error } = await completeTaskAndDescendants(task.id);
        setPending(false);

        if (error) {
            toast.error(error, { id: toastId });
            return;
        }

        await queryClient.invalidateQueries({ queryKey: ['tasks'] });
        toast.dismiss(toastId);
    }

    async function handleDuplicate() {
        setPending(true);
        const toastId = toast.loading('Duplicating task...');
        const { error } = await duplicateTask(task.id);
        setPending(false);

        if (error) {
            toast.error(error, { id: toastId });
            return;
        }

        await queryClient.invalidateQueries({ queryKey: ['tasks'] });
        toast.success('Task duplicated', { id: toastId });
    }

    return (
        <>
            {/* Edit/Delete live only in this menu — always visible since mobile has no hover. */}
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
                        <DropdownMenuItem
                            onClick={handleToggleComplete}
                            disabled={!doneStatus || !defaultStatus}
                            className={!doneStatus || !defaultStatus ? 'opacity-40' : ''}
                        >
                            {isDone ? 'Mark as incomplete' : 'Mark as complete'}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={onAddSubtask}
                            disabled={!canAddSubtask}
                            className={!canAddSubtask ? 'opacity-40' : ''}
                        >
                            Add Subtask
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleDuplicate}>Duplicate</DropdownMenuItem>
                        <DropdownMenuSeparator />

                        {/* Promote — only for non-root tasks */}
                        {canPromote && (
                            <DropdownMenuItem onClick={handlePromote}>
                                Promote to sibling
                            </DropdownMenuItem>
                        )}

                        {/* Nested flyouts don't fit mobile widths, so this opens a bottom Sheet there instead. */}
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

                        {/* Root tasks only — subtasks always render nested, never in a sublist. */}
                        {isRootTask && sublists.length > 0 && (
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger>Move to sublist...</DropdownMenuSubTrigger>
                                <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
                                    <DropdownMenuItem onClick={() => handleMoveToSublist(null)}>
                                        No sublist
                                    </DropdownMenuItem>
                                    {sublists
                                        .filter((sublist) => sublist.id !== task.sublist_id)
                                        .map((sublist) => (
                                            <DropdownMenuItem
                                                key={sublist.id}
                                                onClick={() => handleMoveToSublist(sublist.id)}
                                            >
                                                {sublist.name}
                                            </DropdownMenuItem>
                                        ))}
                                </DropdownMenuSubContent>
                            </DropdownMenuSub>
                        )}

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

            {/* Cascade-complete confirmation — only shown when subtasks are still incomplete */}
            <CompleteTaskDialog
                open={completeConfirmOpen}
                onClose={() => setCompleteConfirmOpen(false)}
                task={task}
                incompleteCount={incompleteDescendants.length}
                onConfirm={handleCascadeComplete}
            />

            {/* Move-to destination picker — mobile only; desktop uses the DropdownMenuSub flyout above */}
            <Sheet open={moveSheetOpen} onOpenChange={(open) => !open && setMoveSheetOpen(false)}>
                <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto">
                    <SheetHeader>
                        <SheetTitle>Move to...</SheetTitle>
                        <SheetDescription className="sr-only">
                            Choose a task to move this one under
                        </SheetDescription>
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
