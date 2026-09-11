'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
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
import { enqueueOrRun, enqueueReorder } from '@/lib/offline-queue';
import StatusFormDialog from './StatusFormDialog';

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
                className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground flex-shrink-0"
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
                          ? 'Built-in status — can’t be deleted'
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
 * Full status management UI — create, rename, recolor, reorder, and delete statuses.
 * Create/edit go through StatusFormDialog, the same modal container Task/List/Sublist use.
 *
 * @param {object} props
 * @param {object[]} props.initialStatuses - SSR-fetched statuses for initial hydration
 */
export default function StatusManager({ initialStatuses }) {
    const queryClient = useQueryClient();
    const [statusDialog, setStatusDialog] = useState({ open: false, status: null });
    const [error, setError] = useState('');
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const { data: statuses = [] } = useQuery({
        queryKey: ['statuses'],
        queryFn: async () => {
            const response = await fetch('/api/statuses');
            if (!response.ok) throw new Error('Failed to fetch statuses');
            return response.json();
        },
        initialData: initialStatuses,
    });

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    async function handleDragEnd({ active, over }) {
        if (!over || active.id === over.id) return;

        const queryKey = ['statuses'];
        const previousStatuses = queryClient.getQueryData(queryKey);

        const oldIndex = statuses.findIndex((status) => status.id === active.id);
        const newIndex = statuses.findIndex((status) => status.id === over.id);
        const reordered = arrayMove(statuses, oldIndex, newIndex);

        queryClient.setQueryData(queryKey, reordered);

        const toastId = toast.loading('Saving order...');

        const changed = reordered.filter((status, index) => status.position !== index);
        const results = await enqueueReorder(changed, 'updateStatus', (status) => ({
            id: status.id,
            fields: { position: reordered.indexOf(status) },
        }));

        const failure = results.find((result) => result.error);
        if (failure) {
            queryClient.setQueryData(queryKey, previousStatuses);
            toast.error(failure.error, { id: toastId });
            return;
        }

        if (results.some((result) => result.queued)) {
            toast.success("Saved — will sync when you're back online", { id: toastId });
        } else {
            await queryClient.invalidateQueries({ queryKey });
            toast.dismiss(toastId);
        }
    }

    async function handleConfirmDelete() {
        if (!deleteTarget) return;

        setDeleting(true);
        const toastId = toast.loading('Deleting status...');

        const queryKey = ['statuses'];
        const previousStatuses = queryClient.getQueryData(queryKey);
        queryClient.setQueryData(queryKey, (current) =>
            current?.filter((existingStatus) => existingStatus.id !== deleteTarget.id),
        );

        const { error, queued } = await enqueueOrRun('deleteStatus', { id: deleteTarget.id });
        setDeleting(false);
        setDeleteTarget(null);

        if (error) {
            queryClient.setQueryData(queryKey, previousStatuses);
            toast.error(error, { id: toastId });
            setError(error);
        } else if (queued) {
            toast.success("Deleted — will sync when you're back online", { id: toastId });
        } else {
            await queryClient.invalidateQueries({ queryKey });
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

            <button
                type="button"
                onClick={() => setStatusDialog({ open: true, status: null })}
                className="w-full rounded-lg border border-dashed border-border py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/40"
            >
                + Add status
            </button>

            <StatusFormDialog
                open={statusDialog.open}
                onClose={() => setStatusDialog({ open: false, status: null })}
                status={statusDialog.status}
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
