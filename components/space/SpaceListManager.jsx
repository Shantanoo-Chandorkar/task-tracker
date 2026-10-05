'use client';

import { useState } from 'react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSpacesQuery } from '@/hooks/useSpacesQuery';
import { useListsQuery } from '@/hooks/useListsQuery';
import { useCurrentUserProfileQuery } from '@/hooks/useCurrentUserProfileQuery';
import { useDragSensors } from '@/hooks/useDragSensors';
import { useSpaceListReorder } from '@/hooks/useSpaceListReorder';
import { useSpaceListDeletion } from '@/hooks/useSpaceListDeletion';
import { useJoinSpaceDialog } from '@/hooks/useJoinSpaceDialog';
import { getMoveTargets } from '@/lib/tasks/move-neighbours';
import { buildAnnouncements, SCREEN_READER_INSTRUCTIONS } from '@/lib/ui/dnd-announcements';
import SpaceFormDialog from './SpaceFormDialog';
import ListFormDialog from './ListFormDialog';
import JoinSpaceDialog from './JoinSpaceDialog';
import SpaceSection from './manager/SpaceSection';
import SpaceListDeleteDialog from './manager/SpaceListDeleteDialog';

const DASHED_BUTTON_CLASS =
    'flex-1 rounded-lg border border-dashed border-border py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/40';

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
    const { data: profile } = useCurrentUserProfileQuery({ initialData: initialProfile });
    const canJoinSpaces = profile?.is_guest === false;
    const [spaceDialog, setSpaceDialog] = useState({ open: false, space: null });
    const [listDialog, setListDialog] = useState({ open: false, list: null, defaultSpaceId: null });
    const { joinDialog, openJoinDialog, closeJoinDialog } = useJoinSpaceDialog();

    const { data: spaces = [] } = useSpacesQuery({ initialData: initialSpaces });
    const { data: lists = [] } = useListsQuery({ initialData: initialLists });
    const ownedSpaces = spaces.filter((space) => space.owner_id === currentUserId);
    const sharedSpaces = spaces.filter((space) => space.owner_id !== currentUserId);

    const deletion = useSpaceListDeletion(lists);
    const { handleDragEnd, moveSpaceNextTo, moveListNextTo } = useSpaceListReorder(
        ownedSpaces,
        lists,
    );
    const sensors = useDragSensors();
    const announcements = buildAnnouncements(
        (rowId) =>
            spaces.find((space) => space.id === rowId)?.name ??
            lists.find((list) => list.id === rowId)?.name,
    );

    const sectionActions = {
        onEditSpace: (space) => setSpaceDialog({ open: true, space }),
        onDeleteSpace: deletion.requestDeleteSpace,
        onAddList: (spaceId) => setListDialog({ open: true, list: null, defaultSpaceId: spaceId }),
        onEditList: (list) => setListDialog({ open: true, list, defaultSpaceId: null }),
        onDeleteList: deletion.requestDeleteList,
        onLeaveSpace: deletion.requestLeaveSpace,
        onMoveSpace: moveSpaceNextTo,
        onMoveList: moveListNextTo,
    };

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
                                moveTargets={getMoveTargets(ownedSpaces, space.id)}
                                actions={sectionActions}
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
                                    actions={sectionActions}
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
                    className={DASHED_BUTTON_CLASS}
                >
                    + Add space
                </button>
                {canJoinSpaces && (
                    <button type="button" onClick={openJoinDialog} className={DASHED_BUTTON_CLASS}>
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

            <SpaceListDeleteDialog deletion={deletion} />
        </div>
    );
}
