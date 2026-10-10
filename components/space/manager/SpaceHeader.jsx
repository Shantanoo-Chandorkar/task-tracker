'use client';

import { GripVertical } from 'lucide-react';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import RowActionsMenu, { MoveMenuItems } from '@/components/custom/RowActionsMenu';
import { Badge } from '@/components/ui/badge';
import { PERMISSION_LEVEL_LABELS } from '@/lib/permissions/space-permissions';

/**
 * Top row of a space card: drag handle, color dot, name, and the owner's menu. A collaborator sees a "Shared with
 * you" note and an access badge instead of the handle and menu.
 *
 * @param {object} props
 * @param {object} props.space - Space to display
 * @param {boolean} props.isOwner - Whether the current user owns this space
 * @param {object} props.dragHandleProps - dnd-kit `listeners` and `attributes` of the space's sortable
 * @param {{ previousId: string|null, nextId: string|null }} [props.moveTargets] - Owned-space neighbours for Move
 * @param {Function} [props.onEditSpace] - Called with the space to open it for editing
 * @param {Function} [props.onDeleteSpace] - Called with the space to ask for delete confirmation
 * @param {(spaceId: string, neighbourId: string) => void} [props.onMoveSpace] - Moves the space next to a neighbour
 */
export default function SpaceHeader({
    space,
    isOwner,
    dragHandleProps,
    moveTargets,
    onEditSpace,
    onDeleteSpace,
    onMoveSpace,
}) {
    return (
        <div className="flex items-center gap-1.5 py-2.5 px-2 border-b border-border group/space">
            {isOwner && (
                <button
                    {...dragHandleProps}
                    className="hit-area [--hit-size:44px] touch-none cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground flex-shrink-0"
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
                    <DropdownMenuItem onClick={() => onEditSpace(space)}>Edit</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <MoveMenuItems
                        canMoveUp={Boolean(moveTargets.previousId)}
                        canMoveDown={Boolean(moveTargets.nextId)}
                        onMoveUp={() => onMoveSpace(space.id, moveTargets.previousId)}
                        onMoveDown={() => onMoveSpace(space.id, moveTargets.nextId)}
                    />
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        onClick={() => onDeleteSpace(space)}
                        className="text-destructive focus:text-destructive"
                    >
                        Delete
                    </DropdownMenuItem>
                </RowActionsMenu>
            )}
        </div>
    );
}
