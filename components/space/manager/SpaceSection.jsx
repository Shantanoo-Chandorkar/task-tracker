'use client';

import { useId, useState } from 'react';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useCurrentUserProfileQuery } from '@/hooks/useCurrentUserProfileQuery';
import { getMoveTargets } from '@/lib/tasks/move-neighbours';
import SpaceSharingSection from '../SpaceSharingSection';
import SpaceSettingsSheet from '../SpaceSettingsSheet';
import ListRow from './ListRow';
import SpaceHeader from './SpaceHeader';
import SpaceFooterActions from './SpaceFooterActions';

/**
 * One drag-reorderable space card: header, its lists, an add-list button and the footer actions.
 * Rename, delete and the sharing panel are owner-only; a collaborator gets a Shared badge and Leave instead.
 *
 * @param {object} props
 * @param {object} props.space - Space to display
 * @param {object[]} props.lists - Lists belonging to this space
 * @param {boolean} props.isOwner - Whether the current user owns this space
 * @param {object|null} [props.initialProfile] - SSR-fetched profile, so canShareSpace never hydration-mismatches
 * @param {{ previousId: string|null, nextId: string|null }} [props.moveTargets] - Owned-space neighbours for Move
 * @param {object} props.actions - What the parent does for each button: `onEditSpace`, `onDeleteSpace`, `onAddList`,
 *   `onEditList`, `onDeleteList`, `onLeaveSpace`, `onMoveSpace` and `onMoveList`
 */
export default function SpaceSection({
    space,
    lists,
    isOwner,
    initialProfile,
    moveTargets,
    actions,
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
            <SpaceHeader
                space={space}
                isOwner={isOwner}
                dragHandleProps={{ ...listeners, ...attributes }}
                moveTargets={moveTargets}
                onEditSpace={actions.onEditSpace}
                onDeleteSpace={actions.onDeleteSpace}
                onMoveSpace={actions.onMoveSpace}
            />

            <div>
                <SortableContext
                    items={lists.map((list) => list.id)}
                    strategy={verticalListSortingStrategy}
                >
                    {lists.map((list) => (
                        <ListRow
                            key={list.id}
                            list={list}
                            onEditRequest={actions.onEditList}
                            onDeleteRequest={actions.onDeleteList}
                            moveTargets={getMoveTargets(lists, list.id)}
                            onMoveList={actions.onMoveList}
                        />
                    ))}
                </SortableContext>

                <button
                    type="button"
                    onClick={() => actions.onAddList(space.id)}
                    className="w-full py-2 pl-4 md:pl-8 pr-2 text-left text-sm text-muted-foreground hover:text-foreground"
                >
                    + Add list
                </button>
            </div>

            <SpaceFooterActions
                isOwner={isOwner}
                canShareSpace={canShareSpace}
                isSharingOpen={sharingOpen}
                sharingPanelId={sharingPanelId}
                onOpenSettings={() => setSettingsOpen(true)}
                onToggleSharing={() => setSharingOpen((open) => !open)}
                onLeaveSpace={() => actions.onLeaveSpace(space)}
            />

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
