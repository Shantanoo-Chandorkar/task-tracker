'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTaskCompletion } from '@/hooks/useTaskCompletion';
import { useTaskPriority } from '@/hooks/useTaskPriority';
import { useSublistsQuery } from '@/hooks/useSublistsQuery';
import { toast } from 'sonner';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import ModalShell from '@/components/ui/modal-shell';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/ui/loader';
import { MoreHorizontal } from 'lucide-react';
import { deleteTask, deleteTaskAndReparentChildren, duplicateTask } from '@/actions/task-actions';
import { findAncestors, buildMoveTargetTree, hasSelectableMoveTarget } from '@/lib/tree';
import TaskFormDialog from '@/components/task-form/TaskFormDialog';
import DeleteTaskDialog from '@/components/task-list/DeleteTaskDialog';
import CompleteTaskDialog from '@/components/task-list/CompleteTaskDialog';
import MoveDestinationList from '@/components/task-list/MoveDestinationList';
import { bustPageCache } from '@/lib/service-worker-cache';
import { NESTING_MODE, FINITE_MAX_DEPTH } from '@/lib/config';

/**
 * Action bar for a task row - a single, always-visible `···` dropdown with
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
 * @param {string|null} [props.currentUserId] - Caller's user id, for row-level ownership checks
 * @param {'owner'|'full'|'restricted'|'read_only'|null} [props.myPermission] - Caller's tier for this space
 */
export default function TaskRowActions({
    task,
    flatList,
    onAddSubtask,
    canAddSubtask = true,
    listId,
    onDeleted,
    currentUserId,
    myPermission,
}) {
    const queryClient = useQueryClient();
    const [editOpen, setEditOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [moveSheetOpen, setMoveSheetOpen] = useState(false);
    const [pending, setPending] = useState(false);
    const isRootTask = !task.parent_id;

    // UX hints only - RLS and the app-layer pre-checks are the real backstop if a control is missed.
    const canCreate = myPermission !== 'read_only';
    const canEditRow =
        canCreate && (myPermission !== 'restricted' || task.created_by === currentUserId);

    const { data: sublists = [] } = useSublistsQuery(listId);

    const {
        doneStatus,
        defaultStatus,
        isDone,
        setComplete,
        confirmState,
        closeConfirm,
        confirmCascade,
    } = useTaskCompletion(listId);
    const taskIsDone = isDone(task);
    const { togglePriority } = useTaskPriority(listId);

    const parent = flatList.find((flatTask) => flatTask.id === task.parent_id);
    const grandparentId = parent?.parent_id ?? null;
    const canPromote = Boolean(task.parent_id);

    // Only roots carry sublist_id, so the moving task's sublist is its top ancestor's.
    const movingTaskRoot = findAncestors(task.id, flatList).at(-1) ?? task;
    const currentSublistId = movingTaskRoot.sublist_id ?? null;

    const maxAllowedDepth = NESTING_MODE === 'finite' ? FINITE_MAX_DEPTH : Infinity;
    const moveTargetRoots = buildMoveTargetTree(flatList, task, maxAllowedDepth);
    const knownSublistIds = new Set(sublists.map((sublist) => sublist.id));
    // A root pointing at a sublist that no longer exists falls back to the Main List group.
    const getGroupIdForRoot = (root) =>
        knownSublistIds.has(root.sublist_id) ? root.sublist_id : null;

    const targetGroups = [
        { id: null, name: 'Main List', color: 'var(--primary)' },
        ...sublists.map((sublist) => ({
            id: sublist.id,
            name: sublist.name,
            color: sublist.color,
        })),
    ].map((group) => ({
        ...group,
        roots: moveTargetRoots.filter((root) => getGroupIdForRoot(root) === group.id),
    }));

    const moveGroups = [
        targetGroups.find((targetGroup) => targetGroup.id === currentSublistId),
        ...targetGroups.filter((targetGroup) => targetGroup.id !== currentSublistId),
    ]
        .filter(Boolean)
        .map((group) => ({
            ...group,
            canMoveToRoot: isRootTask && group.id !== task.sublist_id,
        }))
        .filter((group) => group.canMoveToRoot || hasSelectableMoveTarget(group.roots));

    async function handleDeleteConfirm(strategy) {
        setDeleteOpen(false);
        setPending(true);
        const toastId = toast.loading('Deleting task...');

        let error;
        try {
            ({ error } =
                strategy === 'reparent'
                    ? await deleteTaskAndReparentChildren(task.id)
                    : await deleteTask(task.id));
        } catch {
            setPending(false);
            toast.error('Could not reach the server. Check your connection and try again.', {
                id: toastId,
            });
            return;
        }
        setPending(false);

        if (error) {
            toast.error(error, { id: toastId });
            return;
        }

        await queryClient.invalidateQueries({ queryKey: ['tasks', listId] });
        // Deleting a task changes the list's total count, which the sidebar reads from ['lists'].
        queryClient.invalidateQueries({ queryKey: ['lists'] });
        bustPageCache({ urls: [`/lists/${listId}`] });
        toast.success('Task deleted', { id: toastId });
        onDeleted?.();
    }

    /**
     * Posts a reparent/reposition request and reports the outcome via toast.
     *
     * Shared by promote, move-to-task, and move-to-sublist to avoid repeating this fetch+toast logic three times.
     *
     * @param {object} body - Request body for POST /api/tasks/[id]/move
     * @param {string} successMessage - Toast text shown once the move succeeds
     */
    async function performMove(body, successMessage) {
        setPending(true);
        const toastId = toast.loading('Moving task...');

        let response;
        try {
            response = await fetch(`/api/tasks/${task.id}/move`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
        } catch {
            setPending(false);
            toast.error('Could not reach the server. Check your connection and try again.', {
                id: toastId,
            });
            return;
        }
        const moveResponseBody = await response.json().catch(() => null);
        setPending(false);

        if (!response.ok) {
            toast.error(moveResponseBody?.error || 'Failed to move task', { id: toastId });
            return;
        }

        await queryClient.invalidateQueries({ queryKey: ['tasks', listId] });
        bustPageCache({ urls: [`/lists/${listId}`] });
        toast.success(successMessage, { id: toastId });
    }

    function handlePromote() {
        return performMove(
            { newParentId: grandparentId, afterSiblingId: task.parent_id, listId },
            'Task moved',
        );
    }

    function handleMoveTo(targetId) {
        return performMove({ newParentId: targetId, afterSiblingId: null, listId }, 'Task moved');
    }

    function handleMoveToSublist(targetSublistId) {
        return performMove(
            { newParentId: null, sublistId: targetSublistId, afterSiblingId: null, listId },
            'Task moved',
        );
    }

    async function handleToggleComplete() {
        setPending(true);
        await setComplete(task, flatList, listId, !taskIsDone);
        setPending(false);
    }

    async function handleDuplicate() {
        setPending(true);
        const toastId = toast.loading('Duplicating task...');

        let error;
        try {
            ({ error } = await duplicateTask(task.id));
        } catch {
            setPending(false);
            toast.error('Could not reach the server. Check your connection and try again.', {
                id: toastId,
            });
            return;
        }
        setPending(false);

        if (error) {
            toast.error(error, { id: toastId });
            return;
        }

        await queryClient.invalidateQueries({ queryKey: ['tasks', listId] });
        // Duplicating creates a new task, changing the list's total count in ['lists'].
        queryClient.invalidateQueries({ queryKey: ['lists'] });
        bustPageCache({ urls: [`/lists/${listId}`] });
        toast.success('Task duplicated', { id: toastId });
    }

    return (
        <>
            {/* Edit/Delete live only in this menu - always visible since mobile has no hover. */}
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
                        <DropdownMenuItem
                            onClick={() => setEditOpen(true)}
                            disabled={!canEditRow}
                            className={!canEditRow ? 'opacity-40' : ''}
                        >
                            Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={handleToggleComplete}
                            disabled={!doneStatus || !defaultStatus || !canEditRow}
                            className={
                                !doneStatus || !defaultStatus || !canEditRow ? 'opacity-40' : ''
                            }
                        >
                            {taskIsDone ? 'Mark as incomplete' : 'Mark as complete'}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => togglePriority(task)}
                            disabled={!canEditRow}
                            className={!canEditRow ? 'opacity-40' : ''}
                        >
                            {task.is_prioritised ? 'Remove from priority' : 'Put on priority'}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={onAddSubtask}
                            disabled={!canAddSubtask || !canCreate}
                            className={!canAddSubtask || !canCreate ? 'opacity-40' : ''}
                        >
                            Add Subtask
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={handleDuplicate}
                            disabled={!canCreate}
                            className={!canCreate ? 'opacity-40' : ''}
                        >
                            Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />

                        {/* Promote - only for non-root tasks */}
                        {canPromote && (
                            <DropdownMenuItem
                                onClick={handlePromote}
                                disabled={!canEditRow}
                                className={!canEditRow ? 'opacity-40' : ''}
                            >
                                Promote to sibling
                            </DropdownMenuItem>
                        )}

                        {moveGroups.length > 0 && (
                            <DropdownMenuItem
                                onClick={() => setMoveSheetOpen(true)}
                                disabled={!canEditRow}
                                className={!canEditRow ? 'opacity-40' : ''}
                            >
                                Move to...
                            </DropdownMenuItem>
                        )}

                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={() => setDeleteOpen(true)}
                            disabled={!canEditRow}
                            className={
                                canEditRow
                                    ? 'text-destructive focus:text-destructive'
                                    : 'opacity-40'
                            }
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

            {/* Cascade complete/incomplete confirmation - only shown when descendants would also change */}
            <CompleteTaskDialog
                open={!!confirmState}
                onClose={closeConfirm}
                task={confirmState?.task}
                isComplete={confirmState?.isComplete}
                descendantCount={confirmState?.descendantCount ?? 0}
                onConfirm={confirmCascade}
            />

            {/* Move-to destination picker - same bottom sheet on every breakpoint */}
            <ModalShell
                open={moveSheetOpen}
                onClose={() => setMoveSheetOpen(false)}
                variant="sheet"
                title="Move to..."
                contentClassName="max-h-[70dvh] overflow-y-auto"
            >
                <MoveDestinationList
                    groups={moveGroups}
                    onSelect={(targetId) => {
                        setMoveSheetOpen(false);
                        handleMoveTo(targetId);
                    }}
                    onSelectSublist={(sublistId) => {
                        setMoveSheetOpen(false);
                        handleMoveToSublist(sublistId);
                    }}
                />
            </ModalShell>
        </>
    );
}
