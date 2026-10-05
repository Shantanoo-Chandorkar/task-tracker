'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useStatusesQuery } from '@/hooks/useStatusesQuery';
import { useConfirmAction } from '@/hooks/useConfirmAction';
import { runExclusively, REORDER_BUSY_MESSAGE } from '@/lib/in-flight-entities';
import { toast } from 'sonner';
import { bustPageCache } from '@/lib/cache/service-worker-cache';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
    arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import RowActionsMenu, { MoveMenuItems } from '@/components/custom/RowActionsMenu';
import { Loader } from '@/components/custom/Loader';
import { AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import ModalShell from '@/components/custom/ModalShell';
import { updateStatus, deleteStatus } from '@/actions/status-actions';
import StatusFormDialog from './StatusFormDialog';
import { getMoveTargets } from '@/lib/tasks/move-neighbours';
import { buildAnnouncements, SCREEN_READER_INSTRUCTIONS } from '@/lib/ui/dnd-announcements';

// Module-level so dnd-kit's internal useSensor memoization sees a stable options reference.
const MOUSE_ACTIVATION = { distance: 5 };
const TOUCH_ACTIVATION = { delay: 200, tolerance: 8 };

/**
 * Sortable row for a single status entry in the settings page.
 *
 * @param {object} props
 * @param {object} props.status - Status to display
 * @param {Function} props.onEditRequest - Called with the status to open it for editing
 * @param {Function} props.onDeleteRequest - Called with the status to ask for delete confirmation
 * @param {boolean} props.isOnly - Whether this is the only status (disables delete)
 * @param {{ previousId: string|null, nextId: string|null }} props.moveTargets - Neighbouring statuses for Move up/down
 * @param {(statusId: string, neighbourId: string) => void} props.onMoveStatus - Moves the status next to a neighbour
 */
function StatusRow({ status, onEditRequest, onDeleteRequest, isOnly, moveTargets, onMoveStatus }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: status.id,
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    const canDelete = !isOnly && !status.is_default && !status.code;
    // A disabled item says why it is disabled, so the reason is not hidden in a tooltip
    const deleteLabel = status.is_default
        ? 'Cannot delete the default status'
        : status.code
          ? 'Built-in status - can’t be deleted'
          : isOnly
            ? 'Cannot delete the only status'
            : 'Delete';

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="flex items-center gap-3 py-2.5 px-3 border-b border-border last:border-b-0"
        >
            {/* dnd attributes on the row made a focusable box around other buttons, so they live on the handle */}
            <button
                {...attributes}
                {...listeners}
                className="hit-area [--hit-size:44px] touch-none cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground flex-shrink-0"
                aria-label={`Drag to reorder ${status.name}`}
            >
                <GripVertical className="h-4 w-4" />
            </button>

            <span
                className="h-4 w-4 rounded-full flex-shrink-0"
                style={{ backgroundColor: status.color }}
            />
            <span className="flex-1 text-sm text-foreground min-w-0 [overflow-wrap:anywhere]">
                {status.name}
                {status.is_default && (
                    <span className="ml-2 text-xs text-muted-foreground">(default)</span>
                )}
                {status.code && (
                    <span className="ml-2 text-xs text-muted-foreground">(built-in)</span>
                )}
            </span>
            <RowActionsMenu label={`More actions for ${status.name}`}>
                <DropdownMenuItem onClick={() => onEditRequest(status)}>Edit</DropdownMenuItem>
                <DropdownMenuSeparator />
                <MoveMenuItems
                    canMoveUp={Boolean(moveTargets.previousId)}
                    canMoveDown={Boolean(moveTargets.nextId)}
                    onMoveUp={() => onMoveStatus(status.id, moveTargets.previousId)}
                    onMoveDown={() => onMoveStatus(status.id, moveTargets.nextId)}
                />
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    onSelect={() => onDeleteRequest(status)}
                    disabled={!canDelete}
                    className={canDelete ? 'text-destructive focus:text-destructive' : undefined}
                >
                    {deleteLabel}
                </DropdownMenuItem>
            </RowActionsMenu>
        </div>
    );
}

/**
 * Full status management UI for one space, rendered inline on that space's own card.
 * Create/edit go through StatusFormDialog, the same modal container Task/List/Sublist use.
 *
 * @param {object} props
 * @param {string} props.spaceId - Space these statuses belong to
 * @param {object[]} [props.initialStatuses] - SSR-fetched statuses, for hydration without a flash
 */
export default function StatusManager({ spaceId, initialStatuses }) {
    const queryClient = useQueryClient();
    const [statusDialog, setStatusDialog] = useState({ open: false, status: null });
    const [deleteTarget, setDeleteTarget] = useState(null);
    const deleteConfirm = useConfirmAction(Boolean(deleteTarget));

    const { data: statuses = [], isLoading } = useStatusesQuery(
        spaceId,
        initialStatuses ? { initialData: initialStatuses } : {},
    );

    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: MOUSE_ACTIVATION }),
        // TouchSensor (not PointerSensor) with delay/tolerance, so a tap or scroll isn't grabbed as a drag.
        useSensor(TouchSensor, { activationConstraint: TOUCH_ACTIVATION }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    async function handleDragEnd({ active, over }) {
        if (!over || active.id === over.id) return;

        const oldIndex = statuses.findIndex((status) => status.id === active.id);
        const newIndex = statuses.findIndex((status) => status.id === over.id);
        // The list can change mid-drag (refetch), leaving an id missing and arrayMove with a -1 index.
        if (oldIndex < 0 || newIndex < 0) return;
        return runExclusively(
            `reorder:statuses:${spaceId}`,
            async () => {
                // A reload still in flight would overwrite the new order, so stop it first
                await queryClient.cancelQueries({ queryKey: ['statuses', spaceId] });
                const reordered = arrayMove(statuses, oldIndex, newIndex);

                queryClient.setQueryData(['statuses', spaceId], reordered);

                const toastId = toast.loading('Saving order...');

                let results;
                try {
                    results = await Promise.all(
                        reordered
                            .map((status, newPosition) => ({ status, newPosition }))
                            .filter(({ status, newPosition }) => status.position !== newPosition)
                            .map(({ status, newPosition }) =>
                                updateStatus(status.id, { position: newPosition }),
                            ),
                    );
                } catch {
                    await queryClient.invalidateQueries({ queryKey: ['statuses'] });
                    bustPageCache({ prefixes: ['/lists/'] });
                    toast.error('Could not reach the server. Try again.', { id: toastId });
                    return;
                }

                const failed = results.find((updateOutcome) => updateOutcome.error);
                if (failed) {
                    await queryClient.invalidateQueries({ queryKey: ['statuses'] });
                    bustPageCache({ prefixes: ['/lists/'] });
                    toast.error(failed.error, { id: toastId });
                    return;
                }

                await queryClient.invalidateQueries({ queryKey: ['statuses'] });
                bustPageCache({ prefixes: ['/lists/'] });
                toast.success('Order saved', { id: toastId });
            },
            () => toast.info(REORDER_BUSY_MESSAGE),
        );
    }

    /** Move up / Move down: the same save path as a drag, so the same guards and optimistic update apply. */
    function moveStatusNextTo(statusId, neighbourId) {
        return handleDragEnd({ active: { id: statusId }, over: { id: neighbourId } });
    }

    const announcements = buildAnnouncements(
        (rowId) => statuses.find((status) => status.id === rowId)?.name,
    );

    function handleConfirmDelete() {
        if (!deleteTarget) return;

        return deleteConfirm.runConfirmedAction({
            entityKey: `status-delete:${deleteTarget.id}`,
            loadingMessage: 'Deleting status...',
            successMessage: 'Status deleted',
            action: () => deleteStatus(deleteTarget.id),
            // Tasks lose the deleted status, so the popup waits for both reloads instead of showing stale groups.
            onSuccess: async () => {
                await Promise.all([
                    queryClient.invalidateQueries({ queryKey: ['statuses'] }),
                    queryClient.invalidateQueries({ queryKey: ['tasks'] }),
                ]);
                bustPageCache({ prefixes: ['/lists/'] });
            },
            close: () => setDeleteTarget(null),
        });
    }

    return (
        <div className="space-y-4 max-w-lg">
            <div>
                <h2 className="text-base font-semibold mb-1">Statuses</h2>
                <p className="text-sm text-muted-foreground">
                    Manage the statuses used to organize your tasks. Drag to reorder.
                </p>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center gap-2 rounded-xl bg-card py-6 text-sm text-muted-foreground">
                    <Loader size="sm" />
                    Loading statuses...
                </div>
            ) : (
                <DndContext
                    id="status-dnd"
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                    accessibility={{
                        announcements,
                        screenReaderInstructions: SCREEN_READER_INSTRUCTIONS,
                    }}
                >
                    <SortableContext
                        items={statuses.map((status) => status.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        <div className="rounded-xl bg-card">
                            {statuses.map((status) => (
                                <StatusRow
                                    key={status.id}
                                    status={status}
                                    onEditRequest={(status) =>
                                        setStatusDialog({ open: true, status })
                                    }
                                    onDeleteRequest={setDeleteTarget}
                                    isOnly={statuses.length === 1}
                                    moveTargets={getMoveTargets(statuses, status.id)}
                                    onMoveStatus={moveStatusNextTo}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            )}

            <button
                type="button"
                onClick={() => setStatusDialog({ open: true, status: null })}
                disabled={!spaceId || isLoading}
                className="w-full rounded-lg border border-dashed border-border py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/40 disabled:opacity-50 disabled:pointer-events-none"
            >
                + Add status
            </button>

            <StatusFormDialog
                open={statusDialog.open}
                onClose={() => setStatusDialog({ open: false, status: null })}
                status={statusDialog.status}
                spaceId={spaceId}
            />

            <ModalShell
                open={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                isBusy={deleteConfirm.isPending}
                errorMessage={deleteConfirm.errorMessage}
                variant="alert"
                title={<>Delete &ldquo;{deleteTarget?.name}&rdquo;?</>}
                description="Tasks using this status will lose it. This cannot be undone."
                footer={
                    <>
                        <AlertDialogCancel
                            onClick={() => setDeleteTarget(null)}
                            disabled={deleteConfirm.isPending}
                        >
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmDelete}
                            disabled={deleteConfirm.isPending}
                            className="gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleteConfirm.isPending && <Loader size="xs" />}
                            Delete
                        </AlertDialogAction>
                    </>
                }
            />
        </div>
    );
}
