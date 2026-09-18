'use client';

import { memo, useCallback } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, Circle } from 'lucide-react';
import { useTaskCompletion } from '@/hooks/useTaskCompletion';
import CompleteTaskDialog from '@/components/task-list/CompleteTaskDialog';
import { useUIFlag, toggleFlag } from '@/providers/UIStateProvider';

/**
 * Recursive nested subtask list - each row links to its own task page, with a done/undone checkbox.
 *
 * @param {object} props
 * @param {object[]} props.nodes - Task nodes (from flatToTree) with a `children` array
 * @param {string} props.listId - The list these tasks belong to, for building links
 * @param {object[]} props.flatList - Full flat task list, used to check descendant completeness
 * @param {number} [props.depth] - Current nesting depth (0 = direct children)
 */
export default function SubtaskTree({ nodes, listId, flatList, depth = 0 }) {
    const { doneStatus, defaultStatus, setComplete, confirmState, closeConfirm, confirmCascade } =
        useTaskCompletion(listId);

    const handleToggle = useCallback(
        (node, checked) => setComplete(node, flatList, listId, checked),
        [setComplete, flatList, listId],
    );

    if (!nodes || nodes.length === 0) return null;

    return (
        <div className={depth > 0 ? 'ml-4 border-l border-border pl-3' : ''}>
            {nodes.map((node) => (
                <SubtaskTreeNode
                    key={node.id}
                    node={node}
                    listId={listId}
                    flatList={flatList}
                    depth={depth}
                    doneStatus={doneStatus}
                    defaultStatus={defaultStatus}
                    onToggle={handleToggle}
                />
            ))}
            <CompleteTaskDialog
                open={!!confirmState}
                onClose={closeConfirm}
                task={confirmState?.task}
                isComplete={confirmState?.isComplete}
                descendantCount={confirmState?.descendantCount ?? 0}
                onConfirm={confirmCascade}
            />
        </div>
    );
}

/**
 * A single subtask row plus its collapsed-by-default children, mirroring TaskRow.jsx's chevron.
 *
 * @param {object} props
 * @param {object} props.node - Task node (from flatToTree) with a `children` array
 * @param {string} props.listId - The list these tasks belong to, for building links
 * @param {object[]} props.flatList - Full flat task list, passed through to nested SubtaskTree
 * @param {number} props.depth - Current nesting depth (0 = direct children)
 * @param {object} [props.doneStatus] - The "done" status, for the completion checkbox
 * @param {object} [props.defaultStatus] - The default status, for un-completing
 * @param {Function} props.onToggle - Called with (node, checked) when the checkbox changes
 */
const SubtaskTreeNode = memo(function SubtaskTreeNode({
    node,
    listId,
    flatList,
    depth,
    doneStatus,
    defaultStatus,
    onToggle,
}) {
    const expandKey = `subtask-node:${node.id}`;
    const isExpanded = useUIFlag(expandKey);
    const hasChildren = node.children.length > 0;

    return (
        <div>
            <div className="flex items-center gap-2 py-1.5">
                <button
                    onClick={() => toggleFlag(expandKey)}
                    className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground"
                    aria-label={isExpanded ? 'Collapse subtasks' : 'Expand subtasks'}
                >
                    {hasChildren ? (
                        isExpanded ? (
                            <ChevronDown className="h-3 w-3" />
                        ) : (
                            <ChevronRight className="h-3 w-3" />
                        )
                    ) : (
                        <Circle className="h-1.5 w-1.5 text-muted-foreground/40" />
                    )}
                </button>
                <input
                    type="checkbox"
                    checked={node.status_id === doneStatus?.id}
                    onChange={(e) => onToggle(node, e.target.checked)}
                    disabled={!doneStatus || !defaultStatus}
                    aria-label={`Mark "${node.title}" complete`}
                    className="h-3.5 w-3.5 rounded border-border accent-primary flex-shrink-0"
                />
                <Link
                    href={`/lists/${listId}/tasks/${node.id}`}
                    className="flex flex-1 items-center gap-2 text-sm text-foreground hover:text-foreground min-w-0"
                >
                    <span
                        className="h-2 w-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: node.status_color || '#6b7280' }}
                    />
                    <span className="flex-1 truncate">{node.title}</span>
                    {hasChildren && (
                        <span className="text-xs text-muted-foreground">{node.children.length}</span>
                    )}
                </Link>
            </div>
            {hasChildren && isExpanded && (
                <SubtaskTree nodes={node.children} listId={listId} flatList={flatList} depth={depth + 1} />
            )}
        </div>
    );
});
