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
import { GripVertical, Pencil, Trash2, Check, X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader } from '@/components/ui/loader';
import { createStatus, updateStatus, deleteStatus } from '@/actions/status-actions';

/**
 * Sortable row for a single status entry in the settings page.
 *
 * @param {object} props
 * @param {object} props.status - Status to display and edit
 * @param {Function} props.onUpdate - Called with (id, fields) to save changes
 * @param {Function} props.onDelete - Called with (id) to delete the status
 * @param {boolean} props.isOnly - Whether this is the only status (disables delete)
 */
function StatusRow({ status, onUpdate, onDelete, isOnly }) {
    const [isEditing, setIsEditing] = useState(false);
    const [name, setName] = useState(status.name);
    const [color, setColor] = useState(status.color);
    const [saving, setSaving] = useState(false);

    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: status.id,
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    async function handleSave() {
        if (!name.trim()) return;
        setSaving(true);
        await onUpdate(status.id, { name: name.trim(), color });
        setSaving(false);
        setIsEditing(false);
    }

    function handleCancel() {
        setName(status.name);
        setColor(status.color);
        setIsEditing(false);
    }

    const canDelete = !isOnly && !status.is_default && !status.code;

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            className="flex items-center gap-3 py-2.5 px-3 border-b border-border last:border-b-0"
        >
            {/* Drag handle */}
            <button
                {...listeners}
                className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground flex-shrink-0"
                aria-label="Drag to reorder"
            >
                <GripVertical className="h-4 w-4" />
            </button>

            {/* Color swatch + name */}
            {isEditing ? (
                <>
                    <input
                        type="color"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        className="h-6 w-8 rounded cursor-pointer border-0 bg-transparent p-0 flex-shrink-0"
                    />
                    <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                        className="h-7 text-sm flex-1"
                        autoFocus
                        disabled={saving}
                    />
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 flex-shrink-0"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? (
                            <Loader size="xs" />
                        ) : (
                            <Check className="h-3.5 w-3.5 text-green-500" />
                        )}
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 flex-shrink-0"
                        onClick={handleCancel}
                        disabled={saving}
                    >
                        <X className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                </>
            ) : (
                <>
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
                        onClick={() => setIsEditing(true)}
                    >
                        <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => canDelete && onDelete(status.id)}
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
                </>
            )}
        </div>
    );
}

/**
 * Full status management UI — create, rename, recolor, reorder, and delete statuses.
 * Drag-to-reorder updates the position field on each affected status. Rows live
 * in one unified card with internal dividers; "Add status" is a dashed ghost
 * button below the card that reveals the create form inline.
 *
 * @param {object} props
 * @param {object[]} props.initialStatuses - SSR-fetched statuses for initial hydration
 */
export default function StatusManager({ initialStatuses }) {
    const queryClient = useQueryClient();
    const [addOpen, setAddOpen] = useState(false);
    const [newName, setNewName] = useState('');
    const [newColor, setNewColor] = useState('#6b7280');
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState('');

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

        const oldIndex = statuses.findIndex((status) => status.id === active.id);
        const newIndex = statuses.findIndex((status) => status.id === over.id);
        const reordered = arrayMove(statuses, oldIndex, newIndex);

        queryClient.setQueryData(['statuses'], reordered);

        const toastId = toast.loading('Saving order...');

        for (let i = 0; i < reordered.length; i++) {
            if (reordered[i].position !== i) {
                await updateStatus(reordered[i].id, { position: i });
            }
        }

        await queryClient.invalidateQueries({ queryKey: ['statuses'] });
        toast.dismiss(toastId);
    }

    async function handleUpdate(id, fields) {
        const { error } = await updateStatus(id, fields);
        if (!error) await queryClient.invalidateQueries({ queryKey: ['statuses'] });
    }

    async function handleDelete(id) {
        const toastId = toast.loading('Deleting status...');
        const { error } = await deleteStatus(id);
        if (error) {
            toast.error(error, { id: toastId });
            setError(error);
        } else {
            await queryClient.invalidateQueries({ queryKey: ['statuses'] });
            toast.success('Status deleted', { id: toastId });
        }
    }

    async function handleCreate(e) {
        e.preventDefault();
        if (!newName.trim()) return;

        setCreating(true);
        const { error } = await createStatus({ name: newName.trim(), color: newColor });
        setCreating(false);

        if (error) {
            setError(error);
            return;
        }

        setNewName('');
        setNewColor('#6b7280');
        setError('');
        setAddOpen(false);
        await queryClient.invalidateQueries({ queryKey: ['statuses'] });
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

            {/* Sortable status list — one unified card, internal dividers between rows */}
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
                                onUpdate={handleUpdate}
                                onDelete={handleDelete}
                                isOnly={statuses.length === 1}
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>

            {/* Add new status — dashed ghost button reveals the create form inline */}
            {addOpen ? (
                <form onSubmit={handleCreate} className="flex items-center gap-2">
                    <input
                        type="color"
                        value={newColor}
                        onChange={(e) => setNewColor(e.target.value)}
                        className="h-8 w-10 rounded cursor-pointer border border-border bg-transparent p-0.5 flex-shrink-0"
                        disabled={creating}
                    />
                    <Input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="New status name..."
                        className="flex-1"
                        autoFocus
                        disabled={creating}
                    />
                    <Button
                        type="submit"
                        size="sm"
                        disabled={!newName.trim() || creating}
                        className="gap-1.5"
                    >
                        {creating ? <Loader size="xs" /> : <Plus className="h-3.5 w-3.5" />}
                        Add
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            setAddOpen(false);
                            setNewName('');
                            setError('');
                        }}
                        disabled={creating}
                    >
                        Cancel
                    </Button>
                </form>
            ) : (
                <button
                    type="button"
                    onClick={() => setAddOpen(true)}
                    className="w-full rounded-lg border border-dashed border-border py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/40"
                >
                    + Add status
                </button>
            )}
        </div>
    );
}
