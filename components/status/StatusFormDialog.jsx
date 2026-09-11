'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import ResponsiveModal from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader } from '@/components/ui/loader';
import { createStatus, updateStatus } from '@/actions/status-actions';

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
        const { error } = isEditing
            ? await updateStatus(status.id, { name: name.trim(), color })
            : await createStatus({ name: name.trim(), color });
        setSubmitting(false);

        if (error) {
            setError(error);
            return;
        }

        await queryClient.invalidateQueries({ queryKey: ['statuses'] });
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
