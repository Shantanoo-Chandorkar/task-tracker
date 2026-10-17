'use client';

import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import RowActionsMenu from '@/components/custom/RowActionsMenu';

/**
 * Row for one habit category in the settings list.
 *
 * @param {object} props
 * @param {{ id: string, name: string, color: string }} props.category - Category to display.
 * @param {(category: object) => void} props.onEditRequest - Called with the category to open it for editing.
 * @param {(category: object) => void} props.onDeleteRequest - Called with the category to ask for delete confirmation.
 */
export default function HabitCategoryRow({ category, onEditRequest, onDeleteRequest }) {
    return (
        <div className="flex items-center gap-3 py-2.5 px-3 border-b border-border last:border-b-0">
            <span
                className="h-4 w-4 rounded-full flex-shrink-0"
                style={{ backgroundColor: category.color }}
            />
            <span className="flex-1 text-sm text-foreground min-w-0 [overflow-wrap:anywhere]">
                {category.name}
            </span>
            <RowActionsMenu label={`More actions for ${category.name}`}>
                <DropdownMenuItem onClick={() => onEditRequest(category)}>Edit</DropdownMenuItem>
                <DropdownMenuItem
                    onSelect={() => onDeleteRequest(category)}
                    className="text-destructive focus:text-destructive"
                >
                    Delete
                </DropdownMenuItem>
            </RowActionsMenu>
        </div>
    );
}
