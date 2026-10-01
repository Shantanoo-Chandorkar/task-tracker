'use client';

import { ChevronDown, ChevronRight, Circle } from 'lucide-react';

/**
 * One row of the Move To accordion plus, when expanded, its children.
 *
 * @param {object} props
 * @param {object} props.node - Task node from `buildMoveTargetTree`, with `children` and `isCurrentParent`
 * @param {Set<string>} props.expandedIds - Ids of the rows currently expanded
 * @param {Function} props.onToggleExpand - Called with a node id to expand or collapse that row
 * @param {Function} props.onSelect - Called with the chosen task's id
 */
export default function MoveDestinationNode({ node, expandedIds, onToggleExpand, onSelect }) {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);

    return (
        <div>
            {/* The row owns the toggle so the empty space beside a title opens it; only the title selects */}
            <div
                onClick={hasChildren ? () => onToggleExpand(node.id) : undefined}
                className={`flex min-h-11 items-center ${hasChildren ? 'cursor-pointer' : ''}`}
            >
                {hasChildren ? (
                    <button
                        type="button"
                        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${node.title}`}
                        aria-expanded={isExpanded}
                        className="flex h-11 w-9 flex-shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
                    >
                        {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                        ) : (
                            <ChevronRight className="h-4 w-4" />
                        )}
                    </button>
                ) : (
                    <span className="flex h-11 w-9 flex-shrink-0 items-center justify-center">
                        <Circle className="h-1.5 w-1.5 text-muted-foreground/40" />
                    </span>
                )}

                {node.isCurrentParent ? (
                    <span className="flex flex-wrap items-center gap-2 py-3 text-sm text-muted-foreground">
                        {node.title}
                        <span className="rounded-full border border-input px-2 text-xs">
                            Current parent
                        </span>
                    </span>
                ) : (
                    <button
                        type="button"
                        onClick={(clickEvent) => {
                            clickEvent.stopPropagation();
                            onSelect(node.id);
                        }}
                        className="min-h-11 min-w-0 break-words rounded-md px-2 py-3 text-left text-sm hover:bg-accent active:bg-accent"
                    >
                        {node.title}
                    </button>
                )}
            </div>

            {hasChildren && isExpanded && (
                <div className="ml-4 border-l border-border pl-1">
                    {node.children.map((childNode) => (
                        <MoveDestinationNode
                            key={childNode.id}
                            node={childNode}
                            expandedIds={expandedIds}
                            onToggleExpand={onToggleExpand}
                            onSelect={onSelect}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
