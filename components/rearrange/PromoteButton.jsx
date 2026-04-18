'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ArrowUp } from 'lucide-react';

/**
 * Standalone button that promotes a task up one level in the tree —
 * making it a sibling of its former parent, positioned right after it.
 * Renders nothing if the task has no parent (is already at root level).
 *
 * Note: The promote action is also available via the ··· context menu
 * in TaskRowActions. This component is exported for use in other contexts.
 *
 * @param {object} props
 * @param {object} props.task - The task to promote
 * @param {object[]} props.flatList - Full flat list for grandparent lookup
 */
export default function PromoteButton({ task, flatList }) {
    const queryClient = useQueryClient();

    if (!task.parent_id) return null;

    const parent = flatList.find((t) => t.id === task.parent_id);
    const grandparentId = parent?.parent_id ?? null;

    async function handlePromote() {
        try {
            const response = await fetch(`/api/tasks/${task.id}/move`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    newParentId: grandparentId,
                    afterId: task.parent_id,
                }),
            });

            if (!response.ok) {
                console.error('Promote failed');
                return;
            }

            await queryClient.invalidateQueries({ queryKey: ['tasks'] });
        } catch (err) {
            console.error('Promote operation failed:', err);
        }
    }

    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={handlePromote}
            className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
            <ArrowUp className="h-3 w-3" />
            Promote
        </Button>
    );
}
