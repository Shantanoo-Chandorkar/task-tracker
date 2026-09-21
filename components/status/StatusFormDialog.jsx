'use client';

import { useColorNameForm } from '@/hooks/useColorNameForm';
import ResponsiveModal from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader } from '@/components/ui/loader';
import CharLimitField from '@/components/ui/CharLimitField';
import { createStatus, updateStatus } from '@/actions/status-actions';

const STATUS_NAME_MAX = 100;

/**
 * Modal for creating or editing a Status, rendered through the shared ResponsiveModal container.
 *
 * @param {object} props
 * @param {boolean} props.open - Whether the dialog is open
 * @param {Function} props.onClose - Called when the dialog should close
 * @param {object|null} [props.status] - Status to edit, or null for create mode
 * @param {string} props.spaceId - Space this status belongs to (create mode only)
 */
export default function StatusFormDialog({ open, onClose, status = null, spaceId }) {
    const { isEditing, name, setName, color, setColor, submitting, error, handleSubmit } =
        useColorNameForm({
            open,
            entity: status,
            create: createStatus,
            update: updateStatus,
            buildFields: () => ({ space_id: spaceId }),
            invalidateQueryKey: ['statuses', spaceId],
            bustCache: () => ({ prefixes: ['/lists/'] }),
            onClose,
        });

    return (
        <ResponsiveModal
            open={open}
            onClose={onClose}
            title={isEditing ? 'Edit Status' : 'New Status'}
        >
            <form onSubmit={handleSubmit} className="space-y-4 mt-2">
                <CharLimitField
                    label="Status name"
                    currentLength={name.length}
                    maxLength={STATUS_NAME_MAX}
                    error={error}
                >
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
                            maxLength={STATUS_NAME_MAX}
                        />
                    </div>
                </CharLimitField>

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
