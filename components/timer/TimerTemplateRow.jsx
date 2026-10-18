'use client';

import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import RowActionsMenu from '@/components/custom/RowActionsMenu';
import { useDuplicateTimerTemplate } from '@/hooks/useDuplicateTimerTemplate';

/**
 * Row for one timer template in the settings list.
 *
 * @param {object} props
 * @param {{ id: string, name: string, blocks: object[] }} props.template - Template to display.
 * @param {(template: object) => void} props.onEditRequest - Called with the template to open it for editing.
 * @param {(template: object) => void} props.onDeleteRequest - Called with the template to ask for delete confirmation.
 */
export default function TimerTemplateRow({ template, onEditRequest, onDeleteRequest }) {
    const { duplicateTemplateById } = useDuplicateTimerTemplate();

    return (
        <div className="flex items-center gap-3 py-2.5 px-3 border-b border-border last:border-b-0">
            <div className="flex-1 min-w-0">
                <div className="text-sm text-foreground [overflow-wrap:anywhere]">
                    {template.name}
                </div>
                <div className="text-xs text-muted-foreground">{template.blocks.length} blocks</div>
            </div>
            <RowActionsMenu label={`More actions for ${template.name}`}>
                <DropdownMenuItem onClick={() => onEditRequest(template)}>Edit</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => duplicateTemplateById(template.id)}>
                    Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem
                    onSelect={() => onDeleteRequest(template)}
                    className="text-destructive focus:text-destructive"
                >
                    Delete
                </DropdownMenuItem>
            </RowActionsMenu>
        </div>
    );
}
