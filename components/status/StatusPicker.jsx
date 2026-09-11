'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Loader } from '@/components/ui/loader';
import StatusBadge from './StatusBadge';
import CompleteTaskDialog from '@/components/task-list/CompleteTaskDialog';
import { completeTaskAndDescendants } from '@/actions/task-actions';
import { findIncompleteDescendants } from '@/lib/tree';

/**
 * Inline status dropdown for changing a task's status directly from the task row.
 * When the status changes for a root task, TanStack Query refetch re-groups it
 * under the correct status header automatically. Picking the "done" status while
 * subtasks are still incomplete prompts the same cascade-confirm dialog as the
 * checkbox/"Mark as complete" entry points, instead of failing server-side.
 *
 * @param {object} props
 * @param {object} props.task - The task whose status is being shown/changed
 * @param {object[]} props.flatList - Full flat task list, used to check descendant completeness
 */
export default function StatusPicker({ task, flatList }) {
    const queryClient = useQueryClient();
    const [pending, setPending] = useState(false);
    const [completeConfirmOpen, setCompleteConfirmOpen] = useState(false);

    const { data: statuses = [] } = useQuery({
        queryKey: ['statuses'],
        queryFn: async () => {
            const response = await fetch('/api/statuses');
            if (!response.ok) throw new Error('Failed to fetch statuses');
            return response.json();
        },
    });

    const doneStatus = statuses.find((status) => status.code === 'done');
    const incompleteDescendants = doneStatus
        ? findIncompleteDescendants(task.id, flatList ?? [], doneStatus.id)
        : [];

    async function handleChange(newStatusId) {
        if (doneStatus && newStatusId === doneStatus.id && incompleteDescendants.length > 0) {
            setCompleteConfirmOpen(true);
            return;
        }

        setPending(true);
        try {
            const response = await fetch(`/api/tasks/${task.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status_id: newStatusId }),
            });

            if (!response.ok) {
                console.error('Failed to update task status');
                toast.error('Failed to update task status');
                return;
            }

            await queryClient.invalidateQueries({ queryKey: ['tasks'] });
        } catch (err) {
            console.error('Status update failed:', err);
            toast.error('Failed to update task status');
        } finally {
            setPending(false);
        }
    }

    async function handleCascadeComplete() {
        setCompleteConfirmOpen(false);
        setPending(true);
        const toastId = toast.loading('Marking complete...');
        const { error } = await completeTaskAndDescendants(task.id);
        setPending(false);

        if (error) {
            toast.error(error, { id: toastId });
            return;
        }

        await queryClient.invalidateQueries({ queryKey: ['tasks'] });
        toast.dismiss(toastId);
    }

    const currentStatus = statuses.find((status) => status.id === task.status_id);

    return (
        <>
            <Select value={task.status_id ?? ''} onValueChange={handleChange} disabled={pending}>
                <SelectTrigger className="h-auto border-0 bg-transparent p-0 focus:ring-0 shadow-none w-auto min-w-0 [&>svg]:hidden">
                    <SelectValue>
                        {pending ? (
                            <Loader size="xs" className="text-muted-foreground" />
                        ) : currentStatus ? (
                            <StatusBadge name={currentStatus.name} color={currentStatus.color} />
                        ) : (
                            <span className="text-xs text-muted-foreground">No status</span>
                        )}
                    </SelectValue>
                </SelectTrigger>
                <SelectContent>
                    {statuses.map((status) => (
                        <SelectItem key={status.id} value={status.id}>
                            <span className="flex items-center gap-2">
                                <span
                                    className="h-2 w-2 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: status.color }}
                                />
                                {status.name}
                            </span>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <CompleteTaskDialog
                open={completeConfirmOpen}
                onClose={() => setCompleteConfirmOpen(false)}
                task={task}
                incompleteCount={incompleteDescendants.length}
                onConfirm={handleCascadeComplete}
            />
        </>
    );
}
