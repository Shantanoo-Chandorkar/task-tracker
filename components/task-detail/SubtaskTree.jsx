'use client';

import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronRight } from 'lucide-react';
import { updateTask } from '@/actions/task-actions';

/**
 * Recursive nested subtask list — each row links to its own task page, with a done/undone checkbox.
 *
 * @param {object} props
 * @param {object[]} props.nodes - Task nodes (from flatToTree) with a `children` array
 * @param {string} props.listId - The list these tasks belong to, for building links
 * @param {number} [props.depth] - Current nesting depth (0 = direct children)
 */
export default function SubtaskTree({ nodes, listId, depth = 0 }) {
    const queryClient = useQueryClient();

    const { data: statuses = [] } = useQuery({
        queryKey: ['statuses'],
        queryFn: async () => {
            const response = await fetch('/api/statuses');
            if (!response.ok) throw new Error('Failed to fetch statuses');
            return response.json();
        },
    });

    const doneStatus = statuses.find((status) => status.code === 'done');
    const defaultStatus = statuses.find((status) => status.is_default);

    /**
     * Toggles a subtask's status between the built-in "done" status and the
     * default status, in place — checking a subtask doesn't navigate to it.
     *
     * @param {object} node - The subtask being toggled
     * @param {boolean} checked - Whether the box was just checked
     */
    async function handleToggle(node, checked) {
        const targetStatus = checked ? doneStatus : defaultStatus;
        if (!targetStatus) return;

        const toastId = toast.loading(checked ? 'Marking complete...' : 'Marking incomplete...');
        const { error } = await updateTask(node.id, { status_id: targetStatus.id });

        if (error) {
            toast.error(error, { id: toastId });
            return;
        }

        await queryClient.invalidateQueries({ queryKey: ['tasks'] });
        toast.dismiss(toastId);
    }

    if (!nodes || nodes.length === 0) return null;

    return (
        <div className={depth > 0 ? 'ml-4 border-l border-border pl-3' : ''}>
            {nodes.map((node) => (
                <div key={node.id}>
                    <div className="flex items-center gap-2 py-1.5">
                        <input
                            type="checkbox"
                            checked={node.status_id === doneStatus?.id}
                            onChange={(e) => handleToggle(node, e.target.checked)}
                            disabled={!doneStatus || !defaultStatus}
                            aria-label={`Mark "${node.title}" complete`}
                            className="h-3.5 w-3.5 rounded border-border accent-primary flex-shrink-0"
                        />
                        <Link
                            href={`/lists/${listId}/tasks/${node.id}`}
                            className="group flex flex-1 items-center gap-2 text-sm text-foreground hover:text-foreground min-w-0"
                        >
                            <span
                                className="h-2 w-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: node.status_color || '#6b7280' }}
                            />
                            <span className="flex-1 truncate">{node.title}</span>
                            {node.children.length > 0 && (
                                <span className="text-xs text-muted-foreground">
                                    {node.children.length}
                                </span>
                            )}
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-muted-foreground flex-shrink-0" />
                        </Link>
                    </div>
                    {node.children.length > 0 && (
                        <SubtaskTree nodes={node.children} listId={listId} depth={depth + 1} />
                    )}
                </div>
            ))}
        </div>
    );
}
