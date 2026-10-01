'use client';

import { useState } from 'react';
import { CornerDownRight } from 'lucide-react';
import MoveDestinationNode from '@/components/task-list/MoveDestinationNode';

/**
 * Body of the "Move to..." sheet: one accordion tree per sublist group.
 *
 * @param {object} props
 * @param {object[]} props.groups - Sublist groups, each `{ id, name, color, roots, canMoveToRoot }`
 * @param {Function} props.onSelect - Called with the chosen task's id
 * @param {Function} props.onSelectSublist - Called with the chosen sublist's id (or null for Main List)
 */
export default function MoveDestinationList({ groups, onSelect, onSelectSublist }) {
    // Local state, not the shared UI flags: the sheet unmounts on close, so every open starts collapsed.
    const [expandedIds, setExpandedIds] = useState(() => new Set());

    /**
     * Expands a collapsed row, or collapses an expanded one.
     *
     * @param {string} nodeId - Id of the task row to toggle
     */
    function handleToggleExpand(nodeId) {
        setExpandedIds((currentIds) => {
            const nextIds = new Set(currentIds);
            if (nextIds.has(nodeId)) nextIds.delete(nodeId);
            else nextIds.add(nodeId);
            return nextIds;
        });
    }

    return (
        <div className="flex flex-col overflow-y-auto">
            {groups.map((group) => (
                <div key={group.id ?? 'main'} className="mt-2 first:mt-0">
                    <div className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-foreground">
                        <span
                            className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                            style={{ backgroundColor: group.color || 'var(--primary)' }}
                        />
                        {group.name}
                    </div>

                    {group.canMoveToRoot && (
                        <button
                            type="button"
                            onClick={() => onSelectSublist(group.id)}
                            className="flex min-h-11 w-full items-center gap-2 rounded-md px-3 py-3 text-left text-sm text-muted-foreground hover:bg-accent active:bg-accent"
                        >
                            <CornerDownRight className="h-3.5 w-3.5 shrink-0" />
                            {`Move to ${group.name}`}
                        </button>
                    )}

                    {group.roots.map((rootNode) => (
                        <MoveDestinationNode
                            key={rootNode.id}
                            node={rootNode}
                            expandedIds={expandedIds}
                            onToggleExpand={handleToggleExpand}
                            onSelect={onSelect}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}
