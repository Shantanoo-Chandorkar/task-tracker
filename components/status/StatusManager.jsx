'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useStatusesQuery } from '@/hooks/useStatusesQuery';
import { toast } from 'sonner';
import { bustPageCache } from '@/lib/service-worker-cache';
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
import { GripVertical, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/ui/loader';
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
import { updateStatus, deleteStatus } from '@/actions/status-actions';
import StatusFormDialog from './StatusFormDialog';

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
 */
function StatusRow({ status, onEditRequest, onDeleteRequest, isOnly }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: status.id,
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    const canDelete = !isOnly && !status.is_default && !status.code;

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            className="flex items-center gap-3 py-2.5 px-3 border-b border-border last:border-b-0"
        >
            <button
                {...listeners}
                className="touch-none cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground flex-shrink-0"
                aria-label="Drag to reorder"
            >
                <GripVertical className="h-4 w-4" />
            </button>

            <span
                className="h-4 w-4 rounded-full flex-shrink-0"
                style={{ backgroundColor: status.color }}
            />
            <span className="flex-1 text-sm text-foreground">
                {status.name}
                {status.is_default && (
                    <span className="ml-2 text-xs text-muted-foreground">(default)</span>
                )}
                {status.code && (
                    <span className="ml-2 text-xs text-muted-foreground">(built-in)</span>
                )}
            </span>
            <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => onEditRequest(status)}
            >
                <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => canDelete && onDeleteRequest(status)}
                disabled={!canDelete}
                title={
                    status.is_default
                        ? 'Cannot delete the default status'
                        : status.code
                          ? 'Built-in status - can’t be deleted'
                          : isOnly
                            ? 'Cannot delete the only status'
                            : 'Delete status'
                }
            >
                <Trash2 className="h-3.5 w-3.5" />
            </Button>
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
    const [error, setError] = useState('');
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);

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
        const reordered = arrayMove(statuses, oldIndex, newIndex);

        queryClient.setQueryData(['statuses', spaceId], reordered);

        const toastId = toast.loading('Saving order...');

        let results;
        try {
            results = await Promise.all(
                reordered
                    .map((status, newPosition) => ({ status, newPosition }))
                    .filter(({ status, newPosition }) => status.position !== newPosition)
                    .map(({ status, newPosition }) => updateStatus(status.id, { position: newPosition })),
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
    }

    async function handleConfirmDelete() {
        if (!deleteTarget) return;

        setDeleting(true);
        const toastId = toast.loading('Deleting status...');

        let result;
        try {
            result = await deleteStatus(deleteTarget.id);
        } catch {
            setDeleting(false);
            setDeleteTarget(null);
            toast.error('Could not reach the server. Try again.', { id: toastId });
            return;
        }
        setDeleting(false);
        setDeleteTarget(null);

        if (result.error) {
            toast.error(result.error, { id: toastId });
            setError(result.error);
        } else {
            await queryClient.invalidateQueries({ queryKey: ['statuses'] });
            bustPageCache({ prefixes: ['/lists/'] });
            toast.success('Status deleted', { id: toastId });
        }
    }

    return (
        <div className="space-y-4 max-w-lg">
            <div>
                <h2 className="text-base font-semibold mb-1">Statuses</h2>
                <p className="text-sm text-muted-foreground">
                    Manage the statuses used to organize your tasks. Drag to reorder.
                </p>
            </div>

            {error && (
                <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                    {error}
                </p>
            )}

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
                                    onEditRequest={(status) => setStatusDialog({ open: true, status })}
                                    onDeleteRequest={setDeleteTarget}
                                    isOnly={statuses.length === 1}
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

            <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete &ldquo;{deleteTarget?.name}&rdquo;?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tasks using this status will lose it. This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setDeleteTarget(null)}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmDelete}
                            disabled={deleting}
                            className="gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleting && <Loader size="xs" />}
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
