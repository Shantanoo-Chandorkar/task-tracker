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
import { useTaskStatusMutations } from '@/hooks/useTaskStatusMutations';
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
 * @param {string} props.listId - The list this task belongs to
 */
export default function StatusPicker({ task, flatList, listId }) {
    const queryClient = useQueryClient();
    const { updateStatus, completeWithCascade } = useTaskStatusMutations(listId);
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
        const { error, queued } = await updateStatus(task.id, newStatusId);
        setPending(false);

        if (error) {
            toast.error(error);
            return;
        }

        if (queued) {
            toast.success("Saved — will sync when you're back online");
        } else {
            await queryClient.invalidateQueries({ queryKey: ['tasks'] });
        }
    }

    async function handleCascadeComplete() {
        setCompleteConfirmOpen(false);
        setPending(true);
        const toastId = toast.loading('Marking complete...');
        const { error, queued } = await completeWithCascade(task.id, doneStatus.id, flatList ?? []);
        setPending(false);

        if (error) {
            toast.error(error, { id: toastId });
            return;
        }

        if (queued) {
            toast.success("Saved — will sync when you're back online", { id: toastId });
        } else {
            await queryClient.invalidateQueries({ queryKey: ['tasks'] });
            toast.dismiss(toastId);
        }
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
