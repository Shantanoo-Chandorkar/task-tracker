'use client';

import { useColorNameForm } from '@/hooks/useColorNameForm';
import ResponsiveModal from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader } from '@/components/ui/loader';
import { createSublist, updateSublist } from '@/actions/sublist-actions';

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
    const { isEditing, name, setName, color, setColor, submitting, error, handleSubmit } =
        useColorNameForm({
            open,
            entity: sublist,
            create: createSublist,
            update: updateSublist,
            buildFields: () => ({ list_id: listId }),
            invalidateQueryKey: ['sublists', listId],
            onClose,
        });

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
