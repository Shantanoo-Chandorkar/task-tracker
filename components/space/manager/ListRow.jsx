'use client';

import Link from 'next/link';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import RowActionsMenu, { MoveMenuItems } from '@/components/custom/RowActionsMenu';

/**
 * Row for a single list. Click the name to navigate into it.
 * Editing/creating happens in ListFormDialog, opened by the parent.
 *
 * @param {object} props
 * @param {object} props.list - List to display
 * @param {Function} props.onEditRequest - Called with the list to open it for editing
 * @param {Function} props.onDeleteRequest - Called with the list to ask for delete confirmation
 * @param {{ previousId: string|null, nextId: string|null }} props.moveTargets - Neighbouring lists for Move up/down
 * @param {(list: object, neighbourId: string) => void} props.onMoveList - Moves the list next to a neighbour
 */
export default function ListRow({ list, onEditRequest, onDeleteRequest, moveTargets, onMoveList }) {
    return (
        <div className="flex items-center gap-1.5 py-2 pl-6 pr-2 border-b border-border last:border-b-0">
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
