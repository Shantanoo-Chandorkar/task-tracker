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
 * Modal for creating or editing a Status, rendered through the shared ResponsiveModal container.
 *
 * @param {object} props
 * @param {boolean} props.open - Whether the dialog is open
 * @param {Function} props.onClose - Called when the dialog should close
 * @param {object|null} [props.status] - Status to edit, or null for create mode
 */
export default function StatusFormDialog({ open, onClose, status = null }) {
    const queryClient = useQueryClient();
    const isEditing = Boolean(status);

    const [name, setName] = useState('');
    const [color, setColor] = useState('#6b7280');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const resetKey = open ? (status?.id ?? 'create') : null;
    const [lastResetKey, setLastResetKey] = useState(resetKey);
    if (resetKey !== lastResetKey) {
        setLastResetKey(resetKey);
        if (open) {
            setName(status?.name ?? '');
            setColor(status?.color ?? '#6b7280');
            setError('');
        }
    }

    async function handleSubmit(event) {
        event.preventDefault();
        if (!name.trim()) return;

        setSubmitting(true);

        const queryKey = ['statuses'];
        const previousStatuses = queryClient.getQueryData(queryKey) ?? [];
        const fields = { name: name.trim(), color };

        let result;
        if (isEditing) {
            queryClient.setQueryData(queryKey, (current) =>
                current?.map((existingStatus) =>
                    existingStatus.id === status.id ? { ...existingStatus, ...fields } : existingStatus,
                ),
            );
            result = await enqueueOrRun('updateStatus', { id: status.id, fields });
        } else {
            const newStatusId = crypto.randomUUID();
            const position =
                previousStatuses.length > 0
                    ? Math.max(...previousStatuses.map((existingStatus) => existingStatus.position)) + 1
                    : 0;

            queryClient.setQueryData(queryKey, (current) => [
                ...(current ?? []),
                { id: newStatusId, ...fields, position, is_default: false, code: null },
            ]);

            result = await enqueueOrRun('createStatus', { fields: { ...fields, id: newStatusId } });
        }

        setSubmitting(false);

        if (result.error) {
            // A genuine rejection never actually applied - don't leave the optimistic
            // change showing something that didn't happen.
            queryClient.setQueryData(queryKey, previousStatuses);
            setError(result.error);
            return;
        }

        if (result.queued) {
            toast.success("Saved - will sync when you're back online");
        } else {
            await queryClient.invalidateQueries({ queryKey: ['statuses'] });
        }

        onClose();
    }

    return (
        <ResponsiveModal
            open={open}
            onClose={onClose}
            title={isEditing ? 'Edit Status' : 'New Status'}
        >
            <form onSubmit={handleSubmit} className="space-y-4 mt-2">
                <div className="flex items-center gap-2">
                    <input
                        type="color"
                        value={color}
                        onChange={(event) => setColor(event.target.value)}
                        className="h-9 w-11 rounded cursor-pointer border border-border bg-transparent p-0.5 flex-shrink-0"
                        disabled={submitting}
                    />
                    <Input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Status name"
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
                        {submitting ? 'Saving...' : isEditing ? 'Save changes' : 'Create status'}
                    </Button>
                </div>
            </form>
        </ResponsiveModal>
    );
}
