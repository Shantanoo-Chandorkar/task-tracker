'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTaskPriority } from '@/hooks/useTaskPriority';
import { useSublistsQuery } from '@/hooks/useSublistsQuery';
import { useGetTasks, useTasksQuery } from '@/hooks/useTasksQuery';
import { toast } from 'sonner';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import RowActionsMenu, { MoveMenuItems } from '@/components/custom/RowActionsMenu';
import ModalShell from '@/components/custom/ModalShell';
import MountOnFirstOpen from '@/components/custom/MountOnFirstOpen';
import { deleteTask, deleteTaskAndReparentChildren } from '@/actions/task-actions';
import { useDuplicateTask } from '@/hooks/useDuplicateTask';
import { buildMoveGroups } from '@/lib/move-groups';
import TaskFormDialog from '@/components/task-form/TaskFormDialog';
import DeleteTaskDialog from '@/components/task-list/DeleteTaskDialog';
import MoveDestinationList from '@/components/task-list/MoveDestinationList';
import { bustPageCache } from '@/lib/service-worker-cache';
import { claimInFlight } from '@/lib/in-flight-entities';
import { useConfirmAction } from '@/hooks/useConfirmAction';

/**
 * Where a task can be moved, worked out only while the menu item or the sheet that needs it is mounted.
 *
 * @param {object} task - The task that would move.
 * @param {string} listId - The list the task belongs to, for its tasks and sublists.
 * @returns {ReturnType<typeof buildMoveGroups>} Destination groups with something to pick.
 */
function useMoveGroups(task, listId) {
    // Only reads what the list already loaded; opening a menu must not trigger a reload
    const { data: flatList = [] } = useTasksQuery(listId, { refetchOnMount: false });
    const { data: sublists = [] } = useSublistsQuery(listId);
    return useMemo(() => buildMoveGroups({ task, flatList, sublists }), [task, flatList, sublists]);
}

/**
 * The "Move to..." menu item, shown only when the task has somewhere to go.
 *
 * @param {object} props
 * @param {object} props.task - The task that would move.
 * @param {string} props.listId - The list the task belongs to.
 * @param {boolean} props.isDisabled - True when the caller may not edit this row.
 * @param {Function} props.onChoose - Opens the destination sheet.
 */
function MoveToMenuItem({ task, listId, isDisabled, onChoose }) {
    const moveGroups = useMoveGroups(task, listId);
    if (moveGroups.length === 0) return null;

    return (
        <DropdownMenuItem
            onClick={onChoose}
            disabled={isDisabled}
            className={isDisabled ? 'opacity-40' : ''}
        >
            Move to...
        </DropdownMenuItem>
    );
}

/**
 * Bottom sheet listing the places a task can move to.
 *
 * @param {object} props
 * @param {object} props.task - The task that would move.
 * @param {string} props.listId - The list the task belongs to.
 * @param {boolean} props.open - Whether the sheet is open.
 * @param {Function} props.onClose - Closes the sheet.
 * @param {(targetId: string) => void} props.onSelectTask - Called with the task to move under.
 * @param {(sublistId: string|null) => void} props.onSelectSublist - Called with the sublist to move into.
 */
function MoveToSheet({ task, listId, open, onClose, onSelectTask, onSelectSublist }) {
    const moveGroups = useMoveGroups(task, listId);

    return (
        <ModalShell
            open={open}
            onClose={onClose}
            variant="sheet"
            title="Move to..."
            contentClassName="max-h-[70dvh] overflow-y-auto"
        >
            <MoveDestinationList
                groups={moveGroups}
                onSelect={onSelectTask}
                onSelectSublist={onSelectSublist}
            />
        </ModalShell>
    );
}

/**
 * Action bar for a task row - a single, always-visible `···` dropdown with
 * the full action set (edit, delete, add subtask, duplicate, promote,
 * move to).
 *
 * @param {object} props
 * @param {object} props.task - The task this action bar belongs to
 * @param {ReturnType<typeof import('@/hooks/useTaskCompletion').useTaskCompletion>} props.completion - The row's
 *   shared completion state; its owner renders the cascade dialog
 * @param {Function} props.onAddSubtask - Called when "Add Subtask" is selected
 * @param {boolean} [props.canAddSubtask] - Whether depth allows a subtask; default true
 * @param {string} props.listId - The list this task belongs to
 * @param {Function} [props.onDeleted] - Called after delete, so a task's own detail page can navigate away
 * @param {string|null} [props.currentUserId] - Caller's user id, for row-level ownership checks
 * @param {'owner'|'full'|'restricted'|'read_only'|null} [props.myPermission] - Caller's tier for this space
 * @param {{ previousId: string|null, nextId: string|null }|null} [props.moveTargets] - Neighbours for Move up/down
 * @param {(taskId: string, neighbourId: string) => void} [props.onMoveTask] - Moves this task next to a neighbour
 */
export default function TaskRowActions({
    task,
    completion,
    onAddSubtask,
    canAddSubtask = true,
    listId,
    onDeleted,
    currentUserId,
    myPermission,
    moveTargets,
    onMoveTask,
}) {
    const queryClient = useQueryClient();
    const getTasks = useGetTasks(listId);
    const { duplicateTaskById } = useDuplicateTask(listId);
    const [editOpen, setEditOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [moveSheetOpen, setMoveSheetOpen] = useState(false);
    const [pending, setPending] = useState(false);
    const deleteConfirm = useConfirmAction(deleteOpen);

    // UX hints only - RLS and the app-layer pre-checks are the real backstop if a control is missed.
    const canCreate = myPermission !== 'read_only';
    const canEditRow =
        canCreate && (myPermission !== 'restricted' || task.created_by === currentUserId);

    const { doneStatus, defaultStatus, isDone, setComplete } = completion;
    const taskIsDone = isDone(task);
    const { togglePriority } = useTaskPriority(listId);

    const canPromote = Boolean(task.parent_id);

    function handleDeleteConfirm(strategy) {
        return deleteConfirm.runConfirmedAction({
            entityKey: `task-mutate:${task.id}`,
            loadingMessage: 'Deleting task...',
            successMessage: 'Task deleted',
            action: () =>
                strategy === 'reparent'
                    ? deleteTaskAndReparentChildren(task.id)
                    : deleteTask(task.id),
            // Subtree deletes change other rows, so the popup waits for the reload instead of patching the cache.
            onSuccess: async () => {
                await queryClient.invalidateQueries({ queryKey: ['tasks', listId] });
                // Deleting a task changes the list's total count, which the sidebar reads from ['lists'].
                queryClient.invalidateQueries({ queryKey: ['lists'] });
                bustPageCache({ urls: [`/lists/${listId}`] });
            },
            close: () => {
                setDeleteOpen(false);
                onDeleted?.();
            },
        });
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
        const releaseInFlight = claimInFlight(`task-mutate:${task.id}`);
        if (!releaseInFlight) return;
        setPending(true);
        const toastId = toast.loading('Moving task...');

        try {
            let response;
            try {
                response = await fetch(`/api/tasks/${task.id}/move`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
            } catch {
                toast.error('Could not reach the server. Check your connection and try again.', {
                    id: toastId,
                });
                return;
            }
            const moveResponseBody = await response.json().catch(() => null);

            if (!response.ok) {
                toast.error(moveResponseBody?.error || 'Failed to move task', { id: toastId });
                return;
            }

            await queryClient.invalidateQueries({ queryKey: ['tasks', listId] });
            bustPageCache({ urls: [`/lists/${listId}`] });
            toast.success(successMessage, { id: toastId });
        } finally {
            setPending(false);
            releaseInFlight();
        }
    }

    function handlePromote() {
        const grandparentId =
            getTasks().find((flatTask) => flatTask.id === task.parent_id)?.parent_id ?? null;
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
        await setComplete(task, getTasks(), listId, !taskIsDone);
        setPending(false);
    }

    async function handleDuplicate() {
        setPending(true);
        await duplicateTaskById(task.id);
        setPending(false);
    }

    return (
        <>
            {/* Edit/Delete live only in this menu - always visible since mobile has no hover. */}
            <div className="flex items-center gap-0.5 flex-shrink-0">
                <RowActionsMenu
                    label={`More actions for ${task.title}`}
                    isPending={pending}
                    isCompact
                >
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
                        className={!doneStatus || !defaultStatus || !canEditRow ? 'opacity-40' : ''}
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

                    {moveTargets && (
                        <>
                            <MoveMenuItems
                                canMoveUp={Boolean(moveTargets.previousId)}
                                canMoveDown={Boolean(moveTargets.nextId)}
                                isDisabled={!canEditRow}
                                onMoveUp={() => onMoveTask(task.id, moveTargets.previousId)}
                                onMoveDown={() => onMoveTask(task.id, moveTargets.nextId)}
                            />
                            <DropdownMenuSeparator />
                        </>
                    )}

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

                    <MoveToMenuItem
                        task={task}
                        listId={listId}
                        isDisabled={!canEditRow}
                        onChoose={() => setMoveSheetOpen(true)}
                    />

                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        onClick={() => setDeleteOpen(true)}
                        disabled={!canEditRow}
                        className={
                            canEditRow ? 'text-destructive focus:text-destructive' : 'opacity-40'
                        }
                    >
                        Delete
                    </DropdownMenuItem>
                </RowActionsMenu>
            </div>

            {/* Edit dialog */}
            <MountOnFirstOpen open={editOpen}>
                <TaskFormDialog open={editOpen} onClose={() => setEditOpen(false)} task={task} />
            </MountOnFirstOpen>

            {/* Delete confirmation dialog */}
            <MountOnFirstOpen open={deleteOpen}>
                <DeleteTaskDialog
                    open={deleteOpen}
                    onClose={() => setDeleteOpen(false)}
                    task={task}
                    onConfirm={handleDeleteConfirm}
                    isPending={deleteConfirm.isPending}
                    errorMessage={deleteConfirm.errorMessage}
                />
            </MountOnFirstOpen>

            {/* Move-to destination picker - same bottom sheet on every breakpoint */}
            <MountOnFirstOpen open={moveSheetOpen}>
                <MoveToSheet
                    task={task}
                    listId={listId}
                    open={moveSheetOpen}
                    onClose={() => setMoveSheetOpen(false)}
                    onSelectTask={(targetId) => {
                        setMoveSheetOpen(false);
                        handleMoveTo(targetId);
                    }}
                    onSelectSublist={(sublistId) => {
                        setMoveSheetOpen(false);
                        handleMoveToSublist(sublistId);
                    }}
                />
            </MountOnFirstOpen>
        </>
    );
}
