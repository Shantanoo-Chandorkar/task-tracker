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
 * Modal for creating or editing a Sublist. The parent list is implicit (passed in, not selectable).
 *
 * @param {object} props
 * @param {boolean} props.open - Whether the dialog is open
 * @param {Function} props.onClose - Called when the dialog should close
 * @param {object|null} [props.sublist] - Sublist to edit, or null for create mode
 * @param {string} props.listId - The list this sublist belongs to
 */
export default function SublistFormDialog({ open, onClose, sublist = null, listId }) {
    const queryClient = useQueryClient();
    const isEditing = Boolean(sublist);

    const [name, setName] = useState('');
    const [color, setColor] = useState('#6b7280');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const resetKey = open ? (sublist?.id ?? 'create') : null;
    const [lastResetKey, setLastResetKey] = useState(resetKey);
    if (resetKey !== lastResetKey) {
        setLastResetKey(resetKey);
        if (open) {
            setName(sublist?.name ?? '');
            setColor(sublist?.color ?? '#6b7280');
            setError('');
        }
    }

    async function handleSubmit(event) {
        event.preventDefault();
        if (!name.trim()) return;

        setSubmitting(true);

        const queryKey = ['sublists', listId];
        const previousSublists = queryClient.getQueryData(queryKey) ?? [];
        const fields = { name: name.trim(), color };

        let result;
        if (isEditing) {
            queryClient.setQueryData(queryKey, (current) =>
                current?.map((existingSublist) =>
                    existingSublist.id === sublist.id
                        ? { ...existingSublist, ...fields }
                        : existingSublist,
                ),
            );
            result = await enqueueOrRun('updateSublist', { id: sublist.id, fields });
        } else {
            const newSublistId = crypto.randomUUID();
            const position =
                previousSublists.length > 0
                    ? Math.max(...previousSublists.map((existingSublist) => existingSublist.position)) + 1
                    : 0;

            queryClient.setQueryData(queryKey, (current) => [
                ...(current ?? []),
                { id: newSublistId, ...fields, list_id: listId, position, task_count: 0 },
            ]);

            result = await enqueueOrRun('createSublist', {
                fields: { ...fields, list_id: listId, id: newSublistId },
            });
        }

        setSubmitting(false);

        if (result.error) {
            queryClient.setQueryData(queryKey, previousSublists);
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
        <ResponsiveModal
            open={open}
            onClose={onClose}
            title={isEditing ? 'Edit Sublist' : 'New Sublist'}
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
                        placeholder="Sublist name"
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
                        {submitting ? 'Saving...' : isEditing ? 'Save changes' : 'Create sublist'}
                    </Button>
                </div>
            </form>
        </ResponsiveModal>
    );
}
