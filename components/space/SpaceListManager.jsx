'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSpacesQuery } from '@/hooks/useSpacesQuery';
import { useListsQuery } from '@/hooks/useListsQuery';
import { toast } from 'sonner';
import Link from 'next/link';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
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
import { GripVertical, Pencil, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/ui/loader';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { updateSpace, deleteSpace } from '@/actions/space-actions';
import { updateList, deleteList } from '@/actions/list-actions';
import { leaveSpace } from '@/actions/collaboration-actions';
import SpaceFormDialog from './SpaceFormDialog';
import ListFormDialog from './ListFormDialog';
import JoinSpaceDialog from './JoinSpaceDialog';
import SpaceSharingSection from './SpaceSharingSection';
import StatusManager from '@/components/status/StatusManager';
import { bustPageCache } from '@/lib/service-worker-cache';

// Module-level so dnd-kit's internal useSensor memoization sees a stable options reference.
const MOUSE_ACTIVATION = { distance: 5 };
const TOUCH_ACTIVATION = { delay: 200, tolerance: 8 };

/**
 * Drag-reorderable row for a single list. Click the name to navigate into it.
 * Editing/creating happens in ListFormDialog, opened by the parent.
 *
 * @param {object} props
 * @param {object} props.list - List to display
 * @param {Function} props.onEditRequest - Called with the list to open it for editing
 * @param {Function} props.onDeleteRequest - Called with the list to ask for delete confirmation
 */
function ListRow({ list, onEditRequest, onDeleteRequest }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: list.id,
        data: { type: 'list', spaceId: list.space_id },
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="flex items-center gap-1.5 py-2 pl-6 pr-2 border-b border-border last:border-b-0"
        >
            <button
                {...listeners}
                {...attributes}
                className="touch-none cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground flex-shrink-0"
                aria-label="Drag to reorder"
            >
                <GripVertical className="h-3.5 w-3.5" />
            </button>
            <span
                className="h-3 w-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: list.color }}
            />
            <Link href={`/lists/${list.id}`} className="flex-1 text-sm text-foreground">
                {list.name}
            </Link>
            <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => onEditRequest(list)}
            >
                <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => onDeleteRequest(list)}
            >
                <Trash2 className="h-3.5 w-3.5" />
            </Button>
        </div>
    );
}

/**
 * One drag-reorderable space section: header, its lists, and an add-list entry point.
 * Editing/creating happens in SpaceFormDialog/ListFormDialog, opened by the parent.
 * Rename/delete and the Sharing panel are owner-only; a collaborator sees a "Shared" badge
 * and a Leave button instead -- both still get Statuses, since content rights are shared.
 *
 * @param {object} props
 * @param {object} props.space - Space to display
 * @param {object[]} props.lists - Lists belonging to this space
 * @param {boolean} props.isOwner - Whether the current user owns this space
 * @param {Function} props.onEditSpaceRequest - Called with the space to open it for editing
 * @param {Function} props.onDeleteSpaceRequest - Called with the space to ask for delete confirmation
 * @param {Function} props.onAddListRequest - Called with the space id to open list creation for it
 * @param {Function} props.onEditListRequest - Called with the list to open it for editing
 * @param {Function} props.onDeleteListRequest - Called with the list to ask for delete confirmation
 * @param {Function} props.onLeaveSpaceRequest - Called with the space to leave it
 */
function SpaceSection({
    space,
    lists,
    isOwner,
    onEditSpaceRequest,
    onDeleteSpaceRequest,
    onAddListRequest,
    onEditListRequest,
    onDeleteListRequest,
    onLeaveSpaceRequest,
}) {
    const [statusesOpen, setStatusesOpen] = useState(false);
    const [sharingOpen, setSharingOpen] = useState(false);
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: space.id,
        data: { type: 'space' },
        disabled: !isOwner,
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div ref={setNodeRef} style={style} className="rounded-xl bg-card">
            <div className="flex items-center gap-1.5 py-2.5 px-2 border-b border-border group/space">
                {isOwner && (
                    <button
                        {...listeners}
                        {...attributes}
                        className="touch-none cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground flex-shrink-0"
                        aria-label="Drag to reorder"
                    >
                        <GripVertical className="h-3.5 w-3.5" />
                    </button>
                )}
                <span
                    className="h-4 w-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: space.color }}
                />
                <span className="flex-1 text-sm font-semibold text-foreground">
                    {space.name}
                    {!isOwner && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                            Shared with you
                        </span>
                    )}
                </span>
                {isOwner && (
                    <>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-foreground"
                            onClick={() => onEditSpaceRequest(space)}
                        >
                            <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => onDeleteSpaceRequest(space)}
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </>
                )}
            </div>

            <div>
                <SortableContext
                    items={lists.map((list) => list.id)}
                    strategy={verticalListSortingStrategy}
                >
                    {lists.map((list) => (
                        <ListRow
                            key={list.id}
                            list={list}
                            onEditRequest={onEditListRequest}
                            onDeleteRequest={onDeleteListRequest}
                        />
                    ))}
                </SortableContext>

                <button
                    type="button"
                    onClick={() => onAddListRequest(space.id)}
                    className="w-full py-2 pl-4 md:pl-8 pr-2 text-left text-sm text-muted-foreground hover:text-foreground"
                >
                    + Add list
                </button>
            </div>

            <div className="flex items-center gap-1 border-t border-border px-2 py-1.5">
                <button
                    type="button"
                    onClick={() => setStatusesOpen((open) => !open)}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                    Statuses
                    {statusesOpen ? (
                        <ChevronUp className="h-3 w-3" />
                    ) : (
                        <ChevronDown className="h-3 w-3" />
                    )}
                </button>
                {isOwner && (
                    <button
                        type="button"
                        onClick={() => setSharingOpen((open) => !open)}
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
                    >
                        Share this space
                        {sharingOpen ? (
                            <ChevronUp className="h-3 w-3" />
                        ) : (
                            <ChevronDown className="h-3 w-3" />
                        )}
                    </button>
                )}
                {!isOwner && (
                    <button
                        type="button"
                        onClick={() => onLeaveSpaceRequest(space)}
                        className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-destructive hover:bg-muted"
                    >
                        Leave space
                    </button>
                )}
            </div>

            {statusesOpen && (
                <div className="border-t border-border px-3 py-3">
                    <StatusManager spaceId={space.id} />
                </div>
            )}

            {isOwner && sharingOpen && (
                <div className="border-t border-border px-3 py-3">
                    <SpaceSharingSection space={space} />
                </div>
            )}
        </div>
    );
}

/**
 * Full Space/List management UI — create, rename, recolor, reorder, and delete both.
 * Owned spaces are drag-reorderable; spaces shared with the current user render in a
 * separate, non-reorderable section (reordering a space you don't own would just fail RLS).
 *
 * @param {object} props
 * @param {object[]} props.initialSpaces - SSR-fetched spaces for initial hydration
 * @param {object[]} props.initialLists - SSR-fetched lists (all spaces) for initial hydration
 * @param {string} props.currentUserId - Signed-in user's ID, to tell owned spaces from shared ones
 */
export default function SpaceListManager({ initialSpaces, initialLists, currentUserId }) {
    const queryClient = useQueryClient();
    const [spaceDialog, setSpaceDialog] = useState({ open: false, space: null });
    const [listDialog, setListDialog] = useState({ open: false, list: null, defaultSpaceId: null });
    // Lazy initializer only -- reads the URL once, before the dialog could otherwise ever open,
    // rather than an effect that would set state after an initial closed render.
    const [joinDialog, setJoinDialog] = useState(() => {
        if (typeof window === 'undefined') return { open: false, prefillSpaceId: '' };
        const joinId = new URLSearchParams(window.location.search).get('join');
        return joinId ? { open: true, prefillSpaceId: joinId } : { open: false, prefillSpaceId: '' };
    });
    const [error, setError] = useState('');
    // { type: 'space'|'list'|'leave-space', id, name, counts }
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const { data: spaces = [] } = useSpacesQuery({ initialData: initialSpaces });
    const { data: lists = [] } = useListsQuery({ initialData: initialLists });
    const ownedSpaces = spaces.filter((space) => space.owner_id === currentUserId);
    const sharedSpaces = spaces.filter((space) => space.owner_id !== currentUserId);

    function closeJoinDialog() {
        setJoinDialog({ open: false, prefillSpaceId: '' });
        if (window.location.search.includes('join=')) {
            window.history.replaceState(null, '', '/spaces');
        }
    }

    function handleLeaveSpace(space) {
        setDeleteTarget({ type: 'leave-space', id: space.id, name: space.name, counts: null });
    }

    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: MOUSE_ACTIVATION }),
        // TouchSensor (not PointerSensor) with delay/tolerance, so a tap or scroll isn't grabbed as a drag.
        useSensor(TouchSensor, { activationConstraint: TOUCH_ACTIVATION }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    async function refetchAll() {
        await queryClient.invalidateQueries({ queryKey: ['spaces'] });
        await queryClient.invalidateQueries({ queryKey: ['lists'] });
        bustPageCache({ urls: ['/spaces'] });
    }

    /**
     * Persists new positions (0, 1, 2, ...) for any row whose index changed.
     *
     * @param {object[]} rows - Space or list rows in their new order
     * @param {Function} updateFn - updateSpace or updateList
     * @returns {string|null} Error message if a position update failed, else null
     */
    async function persistPositions(rows, updateFn) {
        let results;
        try {
            results = await Promise.all(
                rows
                    .map((row, newPosition) => ({ row, newPosition }))
                    .filter(({ row, newPosition }) => row.position !== newPosition)
                    .map(({ row, newPosition }) => updateFn(row.id, { position: newPosition })),
            );
        } catch {
            await refetchAll();
            return 'Could not reach the server. Try again.';
        }
        await refetchAll();
        const failed = results.find((updateOutcome) => updateOutcome.error);
        return failed ? failed.error : null;
    }

    async function handleDragEnd({ active, over }) {
        if (!over || active.id === over.id) return;
        const type = active.data.current?.type;
        const toastId = toast.loading('Saving order...');
        let persistError;

        if (type === 'space') {
            const oldIndex = ownedSpaces.findIndex((space) => space.id === active.id);
            const newIndex = ownedSpaces.findIndex((space) => space.id === over.id);
            if (oldIndex === -1 || newIndex === -1) {
                toast.dismiss(toastId);
                return;
            }

            const reorderedOwned = arrayMove(ownedSpaces, oldIndex, newIndex);
            queryClient.setQueryData(['spaces'], [...reorderedOwned, ...sharedSpaces]);
            persistError = await persistPositions(reorderedOwned, updateSpace);
        } else if (type === 'list') {
            const spaceId = active.data.current.spaceId;
            const spaceLists = lists.filter((list) => list.space_id === spaceId);
            const oldIndex = spaceLists.findIndex((list) => list.id === active.id);
            const newIndex = spaceLists.findIndex((list) => list.id === over.id);
            if (oldIndex === -1 || newIndex === -1) {
                toast.dismiss(toastId);
                return;
            }

            const reorderedSpaceLists = arrayMove(spaceLists, oldIndex, newIndex);
            const otherLists = lists.filter((list) => list.space_id !== spaceId);
            queryClient.setQueryData(['lists'], [...otherLists, ...reorderedSpaceLists]);
            persistError = await persistPositions(reorderedSpaceLists, updateList);
        } else {
            toast.dismiss(toastId);
            return;
        }

        toast[persistError ? 'error' : 'success'](persistError ?? 'Order saved', { id: toastId });
    }

    async function requestDeleteSpace(space) {
        setError('');
        try {
            const response = await fetch(`/api/spaces/${space.id}`);
            const spaceDeleteCounts = await response.json();
            setDeleteTarget({
                type: 'space',
                id: space.id,
                name: space.name,
                counts: response.ok
                    ? { lists: spaceDeleteCounts.list_count, tasks: spaceDeleteCounts.task_count }
                    : null,
            });
        } catch {
            toast.error('Could not reach the server. Try again.');
        }
    }

    async function requestDeleteList(list) {
        setError('');
        try {
            const response = await fetch(`/api/lists/${list.id}`);
            const listDeleteCounts = await response.json();
            setDeleteTarget({
                type: 'list',
                id: list.id,
                name: list.name,
                counts: response.ok ? { tasks: listDeleteCounts.task_count } : null,
            });
        } catch {
            toast.error('Could not reach the server. Try again.');
        }
    }

    async function handleConfirmDelete() {
        if (!deleteTarget) return;
        const { type } = deleteTarget;

        setDeleting(true);
        const toastId = toast.loading(
            type === 'space' ? 'Deleting space...' : type === 'list' ? 'Deleting list...' : 'Leaving space...',
        );

        let result;
        try {
            if (type === 'space') result = await deleteSpace(deleteTarget.id);
            else if (type === 'list') result = await deleteList(deleteTarget.id);
            else result = await leaveSpace({ spaceId: deleteTarget.id });
        } catch {
            setDeleting(false);
            setDeleteTarget(null);
            toast.error('Could not reach the server. Try again.', { id: toastId });
            return;
        }
        setDeleting(false);

        setDeleteTarget(null);
        if (result.error) {
            toast.error(result.error, { id: toastId });
            setError(result.error);
        } else {
            if (type === 'space') bustPageCache({ prefixes: ['/lists/'] });
            else if (type === 'list') bustPageCache({ urls: [`/lists/${deleteTarget.id}`] });
            await refetchAll();
            toast.success(
                type === 'space' ? 'Space deleted' : type === 'list' ? 'List deleted' : 'Left space',
                { id: toastId },
            );
        }
    }

    return (
        <div className="space-y-6 max-w-lg">
            <div>
                <h2 className="text-base font-semibold mb-1">Spaces</h2>
                <p className="text-sm text-muted-foreground">
                    Spaces group your lists. Each list holds its own tasks. Drag to reorder.
                </p>
            </div>

            {error && (
                <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                    {error}
                </p>
            )}

            <DndContext
                id="space-list-dnd"
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={ownedSpaces.map((space) => space.id)}
                    strategy={verticalListSortingStrategy}
                >
                    <div className="space-y-3">
                        {ownedSpaces.map((space) => (
                            <SpaceSection
                                key={space.id}
                                space={space}
                                isOwner
                                lists={lists.filter((list) => list.space_id === space.id)}
                                onEditSpaceRequest={(space) =>
                                    setSpaceDialog({ open: true, space })
                                }
                                onDeleteSpaceRequest={requestDeleteSpace}
                                onAddListRequest={(spaceId) =>
                                    setListDialog({
                                        open: true,
                                        list: null,
                                        defaultSpaceId: spaceId,
                                    })
                                }
                                onEditListRequest={(list) =>
                                    setListDialog({ open: true, list, defaultSpaceId: null })
                                }
                                onDeleteListRequest={requestDeleteList}
                            />
                        ))}
                    </div>
                </SortableContext>

                {sharedSpaces.length > 0 && (
                    <div className="space-y-3 mt-6">
                        <p className="text-xs font-medium text-muted-foreground">Shared with you</p>
                        <SortableContext
                            items={sharedSpaces.map((space) => space.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            {sharedSpaces.map((space) => (
                                <SpaceSection
                                    key={space.id}
                                    space={space}
                                    isOwner={false}
                                    lists={lists.filter((list) => list.space_id === space.id)}
                                    onAddListRequest={(spaceId) =>
                                        setListDialog({
                                            open: true,
                                            list: null,
                                            defaultSpaceId: spaceId,
                                        })
                                    }
                                    onEditListRequest={(list) =>
                                        setListDialog({ open: true, list, defaultSpaceId: null })
                                    }
                                    onDeleteListRequest={requestDeleteList}
                                    onLeaveSpaceRequest={handleLeaveSpace}
                                />
                            ))}
                        </SortableContext>
                    </div>
                )}
            </DndContext>

            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={() => setSpaceDialog({ open: true, space: null })}
                    className="flex-1 rounded-lg border border-dashed border-border py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/40"
                >
                    + Add space
                </button>
                <button
                    type="button"
                    onClick={() => setJoinDialog({ open: true, prefillSpaceId: '' })}
                    className="flex-1 rounded-lg border border-dashed border-border py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/40"
                >
                    Join a space
                </button>
            </div>

            <SpaceFormDialog
                open={spaceDialog.open}
                onClose={() => setSpaceDialog({ open: false, space: null })}
                space={spaceDialog.space}
            />

            <ListFormDialog
                open={listDialog.open}
                onClose={() => setListDialog({ open: false, list: null, defaultSpaceId: null })}
                list={listDialog.list}
                defaultSpaceId={listDialog.defaultSpaceId}
            />

            <JoinSpaceDialog
                open={joinDialog.open}
                onClose={closeJoinDialog}
                initialSpaceId={joinDialog.prefillSpaceId}
            />

            <AlertDialog
                open={!!deleteTarget}
                onOpenChange={(open) => !open && setDeleteTarget(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {deleteTarget?.type === 'leave-space'
                                ? `Leave "${deleteTarget?.name}"?`
                                : `Delete "${deleteTarget?.name}"?`}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {deleteTarget?.type === 'space' && deleteTarget.counts
                                ? `This deletes ${deleteTarget.counts.lists} list${deleteTarget.counts.lists !== 1 ? 's' : ''} and ${deleteTarget.counts.tasks} task${deleteTarget.counts.tasks !== 1 ? 's' : ''}. This cannot be undone.`
                                : deleteTarget?.type === 'list' && deleteTarget.counts
                                  ? `This deletes ${deleteTarget.counts.tasks} task${deleteTarget.counts.tasks !== 1 ? 's' : ''}. This cannot be undone.`
                                  : deleteTarget?.type === 'leave-space'
                                    ? "You'll lose access to this space's lists and tasks."
                                    : 'This cannot be undone.'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setDeleteTarget(null)}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmDelete}
                            disabled={deleting}
                            className="gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleting && <Loader size="xs" />}
                            {deleteTarget?.type === 'leave-space' ? 'Leave' : 'Delete'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
