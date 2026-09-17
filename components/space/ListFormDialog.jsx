'use client';

import { useState } from 'react';
import { useColorNameForm } from '@/hooks/useColorNameForm';
import { useSpacesQuery } from '@/hooks/useSpacesQuery';
import ResponsiveModal from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader } from '@/components/ui/loader';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { createList, updateList } from '@/actions/list-actions';

/**
 * Modal for creating or editing a List, rendered through the shared
 * ResponsiveModal container — same container as Task/Space creation.
 *
 * @param {object} props
 * @param {boolean} props.open - Whether the dialog is open
 * @param {Function} props.onClose - Called when the dialog should close
 * @param {object|null} [props.list] - List to edit, or null for create mode
 * @param {string|null} [props.defaultSpaceId] - Space to pre-select in create mode
 */
export default function ListFormDialog({ open, onClose, list = null, defaultSpaceId = null }) {
    const [spaceId, setSpaceId] = useState('');
    const { data: spaces = [] } = useSpacesQuery();

    const { isEditing, name, setName, color, setColor, submitting, error, handleSubmit } =
        useColorNameForm({
            open,
            entity: list,
            onReset: (entity) => setSpaceId(entity?.space_id ?? defaultSpaceId ?? ''),
            isValid: () => Boolean(spaceId),
            create: createList,
            update: updateList,
            buildFields: () => ({ space_id: spaceId }),
            invalidateQueryKey: ['lists'],
            bustCache: () => ({ urls: ['/spaces', ...(list ? [`/lists/${list.id}`] : [])] }),
            onClose,
        });

    return (
        <ResponsiveModal open={open} onClose={onClose} title={isEditing ? 'Edit List' : 'New List'}>
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
                        placeholder="List name"
                        className="flex-1"
                        autoFocus
                        disabled={submitting}
                    />
                </div>

                <Select value={spaceId} onValueChange={setSpaceId} disabled={submitting}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select a space..." />
                    </SelectTrigger>
                    <SelectContent>
                        {spaces.map((space) => (
                            <SelectItem key={space.id} value={space.id}>
                                {space.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {error && <p className="text-xs text-destructive">{error}</p>}

                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        disabled={!name.trim() || !spaceId || submitting}
                        className="gap-1.5"
                    >
                        {submitting && <Loader size="xs" />}
                        {submitting ? 'Saving...' : isEditing ? 'Save changes' : 'Create list'}
                    </Button>
                </div>
            </form>
        </ResponsiveModal>
    );
}
