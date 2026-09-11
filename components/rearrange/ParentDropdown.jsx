'use client';

import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { findAncestors } from '@/lib/tree';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

/**
 * Ancestor reparent dropdown - shows all ancestors of the current task
 * as move targets. Selecting an ancestor makes this task the last child
 * of that ancestor. Only renders if the task has at least one ancestor.
 *
 * @param {object} props
 * @param {object} props.task - The task to move
 * @param {object[]} props.flatList - Full flat list for ancestor lookup
 * @param {Function} [props.onSuccess] - Optional callback after successful move
 */
export default function ParentDropdown({ task, flatList, onSuccess }) {
    const queryClient = useQueryClient();
    const ancestors = findAncestors(task.id, flatList);

    if (ancestors.length === 0) return null;

    async function handleSelect(ancestorId) {
        try {
            const response = await fetch(`/api/tasks/${task.id}/move`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    newParentId: ancestorId,
                    afterSiblingId: null, // Becomes last child of the ancestor
                }),
            });

            if (!response.ok) {
                console.error('Move to ancestor failed');
                toast.error('Failed to move task');
                return;
            }

            await queryClient.invalidateQueries({ queryKey: ['tasks'] });
            onSuccess?.();
        } catch (err) {
            console.error('Move to ancestor failed:', err);
            toast.error('Failed to move task');
        }
    }

    return (
        <Select onValueChange={handleSelect}>
            <SelectTrigger className="h-7 text-xs border-border bg-transparent">
                <SelectValue placeholder="Move to ancestor..." />
            </SelectTrigger>
            <SelectContent>
                {ancestors.map((ancestor) => (
                    <SelectItem key={ancestor.id} value={ancestor.id}>
                        {ancestor.title}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
