'use client';

import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import RowActionsMenu, { MoveMenuItems } from '@/components/custom/RowActionsMenu';

/**
 * Row for one space label (a status or a tag) in the settings list.
 *
 * @param {object} props
 * @param {{ id: string, name: string, color: string }} props.label - Label to display
 * @param {boolean} [props.isReadOnly] - Hides the menu
 * @param {import('react').ReactNode} [props.badges] - Extra text after the name, e.g. "(default)"
 * @param {string|null} props.deleteBlockedReason - Why Delete is unavailable (shown on the disabled item), or null
 * @param {{ previousId: string|null, nextId: string|null }} props.moveTargets - Neighbouring labels for Move up/down
 * @param {(label: object) => void} props.onEditRequest - Called with the label to open it for editing
 * @param {(label: object) => void} props.onDeleteRequest - Called with the label to ask for delete confirmation
 * @param {(labelId: string, neighbourId: string) => void} props.onMove - Moves the label next to a neighbour
 */
export default function LabelRow({
    label,
    isReadOnly = false,
    badges = null,
    deleteBlockedReason,
    moveTargets,
    onEditRequest,
    onDeleteRequest,
    onMove,
}) {
    const canDelete = !deleteBlockedReason;

    return (
        <div className="flex items-center gap-3 py-2.5 px-3 border-b border-border last:border-b-0">
            <span
                className="h-4 w-4 rounded-full flex-shrink-0"
                style={{ backgroundColor: label.color }}
            />
            <span className="flex-1 text-sm text-foreground min-w-0 [overflow-wrap:anywhere]">
                {label.name}
                {badges}
            </span>
            {!isReadOnly && (
                <RowActionsMenu label={`More actions for ${label.name}`}>
                    <DropdownMenuItem onClick={() => onEditRequest(label)}>Edit</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <MoveMenuItems
                        canMoveUp={Boolean(moveTargets.previousId)}
                        canMoveDown={Boolean(moveTargets.nextId)}
                        onMoveUp={() => onMove(label.id, moveTargets.previousId)}
                        onMoveDown={() => onMove(label.id, moveTargets.nextId)}
                    />
                    <DropdownMenuSeparator />
                    {/* A disabled item says why it is disabled, so the reason is not hidden in a tooltip */}
                    <DropdownMenuItem
                        onSelect={() => onDeleteRequest(label)}
                        disabled={!canDelete}
                        className={
                            canDelete ? 'text-destructive focus:text-destructive' : undefined
                        }
                    >
                        {deleteBlockedReason ?? 'Delete'}
                    </DropdownMenuItem>
                </RowActionsMenu>
            )}
        </div>
    );
}
