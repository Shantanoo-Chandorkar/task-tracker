'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import ResponsiveModal from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader } from '@/components/ui/loader';
import { enqueueOrRun } from '@/lib/offline-queue';

/**
 * Modal for creating or editing a Space, rendered through the shared
 * ResponsiveModal container - same container as Task/List creation.
 *
 * @param {object} props
 * @param {boolean} props.open - Whether the dialog is open
 * @param {Function} props.onClose - Called when the dialog should close
 * @param {object|null} [props.space] - Space to edit, or null for create mode
 */
export default function SpaceFormDialog({ open, onClose, space = null }) {
    const queryClient = useQueryClient();
    const isEditing = Boolean(space);

    const [name, setName] = useState('');
    const [color, setColor] = useState('#6b7280');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const resetKey = open ? (space?.id ?? 'create') : null;
    const [lastResetKey, setLastResetKey] = useState(resetKey);
    if (resetKey !== lastResetKey) {
        setLastResetKey(resetKey);
        if (open) {
            setName(space?.name ?? '');
            setColor(space?.color ?? '#6b7280');
            setError('');
        }
    }

    async function handleSubmit(e) {
        e.preventDefault();
        if (!name.trim()) return;

        setSubmitting(true);

        const queryKey = ['spaces'];
        const previousSpaces = queryClient.getQueryData(queryKey) ?? [];
        const fields = { name: name.trim(), color };

        let result;
        if (isEditing) {
            queryClient.setQueryData(queryKey, (current) =>
                current?.map((existingSpace) =>
                    existingSpace.id === space.id ? { ...existingSpace, ...fields } : existingSpace,
                ),
            );
            result = await enqueueOrRun('updateSpace', { id: space.id, fields });
        } else {
            const newSpaceId = crypto.randomUUID();
            const position =
                previousSpaces.length > 0
                    ? Math.max(...previousSpaces.map((existingSpace) => existingSpace.position)) + 1
                    : 0;

            queryClient.setQueryData(queryKey, (current) => [
                ...(current ?? []),
                { id: newSpaceId, ...fields, position },
            ]);

            result = await enqueueOrRun('createSpace', { fields: { ...fields, id: newSpaceId } });
        }

        setSubmitting(false);

        if (result.error) {
            queryClient.setQueryData(queryKey, previousSpaces);
            setError(result.error);
            return;
        }

        if (result.queued) {
            toast.success("Saved - will sync when you're back online");
        } else {
            await queryClient.invalidateQueries({ queryKey });
        }

        onClose();
    }

    return (
        <ResponsiveModal open={open} onClose={onClose} title={isEditing ? 'Edit Space' : 'New Space'}>
            <form onSubmit={handleSubmit} className="space-y-4 mt-2">
                <div className="flex items-center gap-2">
                    <input
                        type="color"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        className="h-9 w-11 rounded cursor-pointer border border-border bg-transparent p-0.5 flex-shrink-0"
                        disabled={submitting}
                    />
                    <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Space name"
                        className="flex-1"
                        autoFocus
                        disabled={submitting}
                    />
                </div>
                {error && <p className="text-xs text-destructive">{error}</p>}

                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={!name.trim() || submitting} className="gap-1.5">
                        {submitting && <Loader size="xs" />}
                        {submitting ? 'Saving...' : isEditing ? 'Save changes' : 'Create space'}
                    </Button>
                </div>
            </form>
        </ResponsiveModal>
    );
}
