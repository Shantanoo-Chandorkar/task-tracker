'use client';

import { useState } from 'react';
import { useColorNameForm } from '@/hooks/useColorNameForm';
import { useSpacesQuery } from '@/hooks/useSpacesQuery';
import { useListsQuery } from '@/hooks/useListsQuery';
import ResponsiveModal from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader } from '@/components/ui/loader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createSublist, updateSublist } from '@/actions/sublist-actions';

/**
 * Modal for creating or editing a Sublist.
 *
 * When `listId` is passed (in-page "+ Add Sublist"), the parent list is implicit. When it's
 * omitted (the global FAB entry point), a "Select list" field lets the user pick any list
 * across every space.
 *
 * @param {object} props
 * @param {boolean} props.open - Whether the dialog is open
 * @param {Function} props.onClose - Called when the dialog should close
 * @param {object|null} [props.sublist] - Sublist to edit, or null for create mode
 * @param {string} [props.listId] - The list this sublist belongs to; omit to show a list picker
 */
export default function SublistFormDialog({ open, onClose, sublist = null, listId }) {
    const isGlobalMode = !listId && !sublist;
    const [selectedListId, setSelectedListId] = useState('');
    const targetListId = listId ?? selectedListId;

    const { data: spaces = [] } = useSpacesQuery({ enabled: isGlobalMode });
    const { data: lists = [] } = useListsQuery({ enabled: isGlobalMode });
    const spaceNameById = new Map(spaces.map((space) => [space.id, space.name]));

    const { isEditing, name, setName, color, setColor, submitting, error, handleSubmit } =
        useColorNameForm({
            open,
            entity: sublist,
            isValid: () => Boolean(targetListId),
            create: createSublist,
            update: updateSublist,
            buildFields: () => ({ list_id: targetListId }),
            invalidateQueryKey: ['sublists', targetListId],
            bustCache: () => ({ urls: [`/lists/${targetListId}`] }),
            onReset: () => setSelectedListId(''),
            onClose,
        });

    return (
        <ResponsiveModal
            open={open}
            onClose={onClose}
            title={isEditing ? 'Edit Sublist' : 'New Sublist'}
        >
            <form onSubmit={handleSubmit} className="space-y-4 mt-2">
                {isGlobalMode && (
                    <Select value={selectedListId} onValueChange={setSelectedListId}>
                        <SelectTrigger className="w-full" disabled={submitting}>
                            <SelectValue placeholder="Select list" />
                        </SelectTrigger>
                        <SelectContent>
                            {lists.map((list) => (
                                <SelectItem key={list.id} value={list.id}>
                                    {spaceNameById.get(list.space_id)
                                        ? `${spaceNameById.get(list.space_id)} / ${list.name}`
                                        : list.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}

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
                    <Button
                        type="submit"
                        disabled={!name.trim() || !targetListId || submitting}
                        className="gap-1.5"
                    >
                        {submitting && <Loader size="xs" />}
                        {submitting ? 'Saving...' : isEditing ? 'Save changes' : 'Create sublist'}
                    </Button>
                </div>
            </form>
        </ResponsiveModal>
    );
}
