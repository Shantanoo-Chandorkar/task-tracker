'use client';

import { useColorNameForm } from '@/hooks/useColorNameForm';
import ResponsiveModal from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader } from '@/components/ui/loader';
import { createSpace, updateSpace } from '@/actions/space-actions';

/**
 * Modal for creating or editing a Space, rendered through the shared
 * ResponsiveModal container — same container as Task/List creation.
 *
 * @param {object} props
 * @param {boolean} props.open - Whether the dialog is open
 * @param {Function} props.onClose - Called when the dialog should close
 * @param {object|null} [props.space] - Space to edit, or null for create mode
 */
export default function SpaceFormDialog({ open, onClose, space = null }) {
    const { isEditing, name, setName, color, setColor, submitting, error, handleSubmit } =
        useColorNameForm({
            open,
            entity: space,
            create: createSpace,
            update: updateSpace,
            invalidateQueryKey: ['spaces'],
            bustCache: () => ({ urls: ['/spaces'], prefixes: ['/lists/'] }),
            onClose,
        });

    return (
        <ResponsiveModal open={open} onClose={onClose} title={isEditing ? 'Edit Space' : 'New Space'}>
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
