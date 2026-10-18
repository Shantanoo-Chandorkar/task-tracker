'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import RowActionsMenu, { MoveMenuItems } from '@/components/custom/RowActionsMenu';

/**
 * Collapsible sublist section header - color swatch, name, status breakdown, edit, delete.
 *
 * @param {object} props
 * @param {object} props.sublist
 * @param {number} props.taskCount
 * @param {string} props.breakdownText
 * @param {boolean} props.isCollapsed
 * @param {Function} props.onToggle
 * @param {Function} props.onEdit
 * @param {Function} props.onDelete
 * @param {Function} props.onAddTask - Opens task creation in this sublist
 * @param {{ previousId: string|null, nextId: string|null }} props.moveTargets - Neighbouring sublists for Move up/down
 * @param {(sublistId: string, neighbourId: string) => void} props.onMoveSublist - Moves a sublist next to a neighbour
 */
export default function SublistHeader({
    sublist,
    taskCount,
    breakdownText,
    isCollapsed,
    onToggle,
    onEdit,
    onDelete,
    onAddTask,
    moveTargets,
    onMoveSublist,
}) {
    return (
        <div className="flex items-center gap-1.5 rounded-lg bg-card px-3 py-2.5 group/sublist">
            <h2 className="flex min-w-0 flex-1">
                <button
                    className="flex items-center gap-2 flex-1 min-w-0 text-left"
                    onClick={onToggle}
                    aria-expanded={!isCollapsed}
                >
                    {isCollapsed ? (
                        <ChevronRight
                            aria-hidden="true"
                            className="h-3.5 w-3.5 text-muted-foreground"
                        />
                    ) : (
                        <ChevronDown
                            aria-hidden="true"
                            className="h-3.5 w-3.5 text-muted-foreground"
                        />
                    )}
                    <span
                        className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: sublist.color }}
                    />
                    <span className="text-sm font-semibold text-foreground truncate">
                        {sublist.name}
                    </span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                        ({taskCount})
                    </span>
                </button>
            </h2>

            {breakdownText && (
                <span className="hidden sm:block flex-shrink-0 text-xs text-muted-foreground">
                    {breakdownText}
                </span>
            )}

            <RowActionsMenu label={`Sublist actions for ${sublist.name}`}>
                <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
                <DropdownMenuItem onClick={onAddTask}>Add task</DropdownMenuItem>
                <DropdownMenuSeparator />
                <MoveMenuItems
                    canMoveUp={Boolean(moveTargets.previousId)}
                    canMoveDown={Boolean(moveTargets.nextId)}
                    onMoveUp={() => onMoveSublist(sublist.id, moveTargets.previousId)}
                    onMoveDown={() => onMoveSublist(sublist.id, moveTargets.nextId)}
                />
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    onClick={onDelete}
                    className="text-destructive focus:text-destructive"
                >
                    Delete
                </DropdownMenuItem>
            </RowActionsMenu>
        </div>
    );
}
