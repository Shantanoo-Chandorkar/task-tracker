'use client';

import { useId, useState } from 'react';
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
import { GripVertical, ChevronDown, ChevronUp, Settings } from 'lucide-react';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import RowActionsMenu, { MoveMenuItems } from '@/components/ui/RowActionsMenu';
import { Badge } from '@/components/ui/badge';
import { Loader } from '@/components/ui/loader';
import { AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import ModalShell from '@/components/ui/modal-shell';
import { updateSpace, deleteSpace } from '@/actions/space-actions';
import { updateList, deleteList } from '@/actions/list-actions';
import { leaveSpace } from '@/actions/collaboration-actions';
import { useCurrentUserProfileQuery } from '@/hooks/useCurrentUserProfileQuery';
import { PERMISSION_LEVEL_LABELS } from '@/lib/permissions/space-permissions';
import SpaceFormDialog from './SpaceFormDialog';
import ListFormDialog from './ListFormDialog';
import JoinSpaceDialog from './JoinSpaceDialog';
import SpaceSharingSection from './SpaceSharingSection';
import SpaceSettingsSheet from './SpaceSettingsSheet';
import { bustPageCache } from '@/lib/service-worker-cache';
import { removeRowFromCache } from '@/lib/query-cache';
import { useDeleteConfirm } from '@/hooks/useDeleteConfirm';
import { runExclusively, REORDER_BUSY_MESSAGE } from '@/lib/in-flight-entities';
import { useConfirmAction } from '@/hooks/useConfirmAction';
import { countSpaceContents } from '@/lib/delete-counts';
import { getMoveTargets } from '@/lib/move-targets';
import { buildAnnouncements, SCREEN_READER_INSTRUCTIONS } from '@/lib/dnd-announcements';

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
 * @param {{ previousId: string|null, nextId: string|null }} props.moveTargets - Neighbouring lists for Move up/down
 * @param {(list: object, neighbourId: string) => void} props.onMoveList - Moves the list next to a neighbour
 */
function ListRow({ list, onEditRequest, onDeleteRequest, moveTargets, onMoveList }) {
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
                className="hit-area [--hit-size:44px] touch-none cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground flex-shrink-0"
                aria-label={`Drag to reorder ${list.name}`}
            >
                <GripVertical className="h-3.5 w-3.5" />
            </button>
            <span
                className="h-3 w-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: list.color }}
            />
            <Link
                href={`/lists/${list.id}`}
                className="flex-1 text-sm text-foreground min-w-0 [overflow-wrap:anywhere]"
            >
                {list.name}
            </Link>
            <RowActionsMenu label={`More actions for ${list.name}`}>
                <DropdownMenuItem onClick={() => onEditRequest(list)}>Edit</DropdownMenuItem>
                <DropdownMenuSeparator />
                <MoveMenuItems
                    canMoveUp={Boolean(moveTargets.previousId)}
                    canMoveDown={Boolean(moveTargets.nextId)}
                    onMoveUp={() => onMoveList(list, moveTargets.previousId)}
                    onMoveDown={() => onMoveList(list, moveTargets.nextId)}
                />
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    onClick={() => onDeleteRequest(list)}
                    className="text-destructive focus:text-destructive"
                >
                    Delete
                </DropdownMenuItem>
            </RowActionsMenu>
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
 * @param {object|null} [props.initialProfile] - SSR-fetched profile, so canShareSpace never hydration-mismatches
 * @param {Function} props.onEditSpaceRequest - Called with the space to open it for editing
 * @param {Function} props.onDeleteSpaceRequest - Called with the space to ask for delete confirmation
 * @param {Function} props.onAddListRequest - Called with the space id to open list creation for it
 * @param {Function} props.onEditListRequest - Called with the list to open it for editing
 * @param {Function} props.onDeleteListRequest - Called with the list to ask for delete confirmation
 * @param {Function} props.onLeaveSpaceRequest - Called with the space to leave it
 * @param {{ previousId: string|null, nextId: string|null }} [props.moveTargets] - Owned-space neighbours for Move
 * @param {(spaceId: string, neighbourId: string) => void} [props.onMoveSpace] - Moves the space next to a neighbour
 * @param {(list: object, neighbourId: string) => void} props.onMoveListRequest - Moves a list next to a neighbour
 */
function SpaceSection({
    space,
    lists,
    isOwner,
    initialProfile,
    onEditSpaceRequest,
    onDeleteSpaceRequest,
    onAddListRequest,
    onEditListRequest,
    onDeleteListRequest,
    onLeaveSpaceRequest,
    moveTargets,
    onMoveSpace,
    onMoveListRequest,
}) {
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [sharingOpen, setSharingOpen] = useState(false);
    const sharingPanelId = useId();
    const { data: profile } = useCurrentUserProfileQuery({ initialData: initialProfile });
    // Guests cannot share; the button stays hidden until the profile confirms a registered user
    const canShareSpace = isOwner && profile?.is_guest === false;
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
                        className="hit-area [--hit-size:44px] touch-none cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground flex-shrink-0"
                        aria-label={`Drag to reorder ${space.name}`}
                    >
                        <GripVertical className="h-3.5 w-3.5" />
                    </button>
                )}
                <span
                    className="h-4 w-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: space.color }}
                />
                <span className="flex-1 text-sm font-semibold text-foreground min-w-0 [overflow-wrap:anywhere]">
                    {space.name}
                    {!isOwner && (
                        <span className="ml-2 inline-flex items-center gap-1.5 align-middle">
                            <span className="text-xs font-normal text-muted-foreground">
                                Shared with you
                            </span>
                            {PERMISSION_LEVEL_LABELS[space.my_permission_level] && (
                                <Badge
                                    variant="outline"
                                    className="border-metric/25 bg-metric/15 text-metric"
                                >
                                    {PERMISSION_LEVEL_LABELS[space.my_permission_level]} access
                                </Badge>
                            )}
                        </span>
                    )}
                </span>
                {isOwner && (
                    <RowActionsMenu label={`More actions for ${space.name}`}>
                        <DropdownMenuItem onClick={() => onEditSpaceRequest(space)}>
                            Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <MoveMenuItems
                            canMoveUp={Boolean(moveTargets.previousId)}
                            canMoveDown={Boolean(moveTargets.nextId)}
                            onMoveUp={() => onMoveSpace(space.id, moveTargets.previousId)}
                            onMoveDown={() => onMoveSpace(space.id, moveTargets.nextId)}
                        />
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={() => onDeleteSpaceRequest(space)}
                            className="text-destructive focus:text-destructive"
                        >
                            Delete
                        </DropdownMenuItem>
                    </RowActionsMenu>
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
                            moveTargets={getMoveTargets(lists, list.id)}
                            onMoveList={onMoveListRequest}
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
                    onClick={() => setSettingsOpen(true)}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
                    aria-label="Space settings"
                >
                    <Settings className="h-3 w-3" />
                    Settings
                </button>
                {canShareSpace && (
                    <button
                        type="button"
                        onClick={() => setSharingOpen((open) => !open)}
                        aria-expanded={sharingOpen}
                        aria-controls={sharingPanelId}
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
                    >
                        Share this space
                        {sharingOpen ? (
                            <ChevronUp aria-hidden="true" className="h-3 w-3" />
                        ) : (
                            <ChevronDown aria-hidden="true" className="h-3 w-3" />
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

            <SpaceSettingsSheet
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                spaceId={space.id}
                spaceName={space.name}
                isOwner={isOwner}
            />

            {canShareSpace && sharingOpen && (
                <div id={sharingPanelId} className="border-t border-border px-3 py-3">
                    <SpaceSharingSection space={space} />
                </div>
            )}
        </div>
    );
}

/**
 * Full Space/List management UI - create, rename, recolor, reorder, and delete both.
 * Owned spaces are drag-reorderable; spaces shared with the current user render in a
 * separate, non-reorderable section (reordering a space you don't own would just fail RLS).
 *
 * @param {object} props
 * @param {object[]} props.initialSpaces - SSR-fetched spaces for initial hydration
 * @param {object[]} props.initialLists - SSR-fetched lists (all spaces) for initial hydration
 * @param {string} props.currentUserId - Signed-in user's ID, to tell owned spaces from shared ones
 * @param {object|null} [props.initialProfile] - SSR-fetched profile, so canJoinSpaces never hydration-mismatches
 */
export default function SpaceListManager({
    initialSpaces,
    initialLists,
    currentUserId,
    initialProfile,
}) {
    const queryClient = useQueryClient();
    const { data: profile } = useCurrentUserProfileQuery({ initialData: initialProfile });
    const canJoinSpaces = profile?.is_guest === false;
    const [spaceDialog, setSpaceDialog] = useState({ open: false, space: null });
    const [listDialog, setListDialog] = useState({ open: false, list: null, defaultSpaceId: null });
    // Lazy initializer only -- reads the URL once, before the dialog could otherwise ever open,
    // rather than an effect that would set state after an initial closed render.
    const [joinDialog, setJoinDialog] = useState(() => {
        if (typeof window === 'undefined') return { open: false, prefillSpaceId: '' };
        const joinId = new URLSearchParams(window.location.search).get('join');
        return joinId
            ? { open: true, prefillSpaceId: joinId }
            : { open: false, prefillSpaceId: '' };
    });
    // { type: 'space'|'list'|'leave-space', id, name, counts }
    const { deleteTarget, setDeleteTarget, requestDelete } = useDeleteConfirm();
    const deleteConfirm = useConfirmAction(Boolean(deleteTarget));

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
        return runExclusively(
            'reorder:spaces-and-lists',
            async () => {
                // A reload still in flight would overwrite the new order, so stop it first
                await queryClient.cancelQueries({ queryKey: ['spaces'] });
                await queryClient.cancelQueries({ queryKey: ['lists'] });
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

                toast[persistError ? 'error' : 'success'](persistError ?? 'Order saved', {
                    id: toastId,
                });
            },
            () => toast.info(REORDER_BUSY_MESSAGE),
        );
    }

    /** Move up / Move down: the same save path as a drag, so the same guards and optimistic update apply. */
    function moveSpaceNextTo(spaceId, neighbourId) {
        return handleDragEnd({
            active: { id: spaceId, data: { current: { type: 'space' } } },
            over: { id: neighbourId },
        });
    }

    function moveListNextTo(list, neighbourId) {
        return handleDragEnd({
            active: { id: list.id, data: { current: { type: 'list', spaceId: list.space_id } } },
            over: { id: neighbourId },
        });
    }

    const announcements = buildAnnouncements(
        (rowId) =>
            spaces.find((space) => space.id === rowId)?.name ??
            lists.find((list) => list.id === rowId)?.name,
    );

    function requestDeleteSpace(space) {
        requestDelete(
            {
                type: 'space',
                id: space.id,
                name: space.name,
                counts: countSpaceContents(space.id, lists),
            },
            {
                countsUrl: `/api/spaces/${space.id}`,
                withFreshCounts: (openTarget, fetched) => ({
                    ...openTarget,
                    counts: { lists: fetched.list_count, tasks: fetched.task_count },
                }),
            },
        );
    }

    function requestDeleteList(list) {
        requestDelete(
            {
                type: 'list',
                id: list.id,
                name: list.name,
                counts: { tasks: list.task_count ?? 0 },
            },
            {
                countsUrl: `/api/lists/${list.id}`,
                withFreshCounts: (openTarget, fetched) => ({
                    ...openTarget,
                    counts: { tasks: fetched.task_count },
                }),
            },
        );
    }

    function handleConfirmDelete() {
        if (!deleteTarget) return;
        const { type, id: targetId } = deleteTarget;
        const copyByType = {
            space: { loading: 'Deleting space...', done: 'Space deleted' },
            list: { loading: 'Deleting list...', done: 'List deleted' },
            'leave-space': { loading: 'Leaving space...', done: 'Left space' },
        };

        return deleteConfirm.runConfirmedAction({
            entityKey: `${type}-delete:${targetId}`,
            loadingMessage: copyByType[type].loading,
            successMessage: copyByType[type].done,
            action: () => {
                if (type === 'space') return deleteSpace(targetId);
                if (type === 'list') return deleteList(targetId);
                return leaveSpace({ spaceId: targetId });
            },
            // The row leaves the lists at once, so the popup closes onto the final screen; the reload is quiet.
            onSuccess: () => {
                if (type === 'list') bustPageCache({ urls: [`/lists/${targetId}`] });
                else bustPageCache({ prefixes: ['/lists/'] });
                removeRowFromCache(queryClient, type === 'list' ? ['lists'] : ['spaces'], targetId);
                if (type !== 'list') {
                    queryClient.setQueryData(['lists'], (cachedLists) =>
                        cachedLists?.filter((list) => list.space_id !== targetId),
                    );
                }
                refetchAll();
            },
            close: () => setDeleteTarget(null),
        });
    }

    return (
        <div className="space-y-6 max-w-lg">
            <div>
                <h2 className="text-base font-semibold mb-1">Your spaces</h2>
                <p className="text-sm text-muted-foreground">
                    Spaces group your lists. Each list holds its own tasks. Drag to reorder.
                </p>
            </div>

            <DndContext
                id="space-list-dnd"
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
                accessibility={{
                    announcements,
                    screenReaderInstructions: SCREEN_READER_INSTRUCTIONS,
                }}
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
                                initialProfile={initialProfile}
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
                                moveTargets={getMoveTargets(ownedSpaces, space.id)}
                                onMoveSpace={moveSpaceNextTo}
                                onMoveListRequest={moveListNextTo}
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
                                    initialProfile={initialProfile}
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
                                    onMoveListRequest={moveListNextTo}
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
                {canJoinSpaces && (
                    <button
                        type="button"
                        onClick={() => setJoinDialog({ open: true, prefillSpaceId: '' })}
                        className="flex-1 rounded-lg border border-dashed border-border py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/40"
                    >
                        Join a space
                    </button>
                )}
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

            <ModalShell
                open={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                isBusy={deleteConfirm.isPending}
                errorMessage={deleteConfirm.errorMessage}
                variant="alert"
                title={
                    deleteTarget?.type === 'leave-space'
                        ? `Leave "${deleteTarget?.name}"?`
                        : `Delete "${deleteTarget?.name}"?`
                }
                description={
                    deleteTarget?.type === 'space' && deleteTarget.counts
                        ? `This deletes ${deleteTarget.counts.lists} list${deleteTarget.counts.lists !== 1 ? 's' : ''} and ${deleteTarget.counts.tasks} task${deleteTarget.counts.tasks !== 1 ? 's' : ''}. This cannot be undone.`
                        : deleteTarget?.type === 'list' && deleteTarget.counts
                          ? `This deletes ${deleteTarget.counts.tasks} task${deleteTarget.counts.tasks !== 1 ? 's' : ''}. This cannot be undone.`
                          : deleteTarget?.type === 'leave-space'
                            ? "You'll lose access to this space's lists and tasks."
                            : 'This cannot be undone.'
                }
                footer={
                    <>
                        <AlertDialogCancel
                            onClick={() => setDeleteTarget(null)}
                            disabled={deleteConfirm.isPending}
                        >
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmDelete}
                            disabled={deleteConfirm.isPending}
                            className="gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleteConfirm.isPending && <Loader size="xs" />}
                            {deleteTarget?.type === 'leave-space' ? 'Leave' : 'Delete'}
                        </AlertDialogAction>
                    </>
                }
            />
        </div>
    );
}
