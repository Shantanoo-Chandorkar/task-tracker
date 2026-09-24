'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useStatusesQuery } from '@/hooks/useStatusesQuery';
import { useTaskCompletion } from '@/hooks/useTaskCompletion';
import { useSpaceIdForList } from '@/hooks/useSpaceIdForList';
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
import { bustPageCache } from '@/lib/service-worker-cache';

/**
 * Inline status dropdown for changing a task's status directly from the task row.
 * Picking a status that changes done-ness routes through the shared cascade-confirm flow, both directions.
 *
 * @param {object} props
 * @param {object} props.task - The task whose status is being shown/changed
 * @param {object[]} props.flatList - Full flat task list, used to check descendant completeness
 */
export default function StatusPicker({ task, flatList }) {
    const queryClient = useQueryClient();
    const [pending, setPending] = useState(false);
    const spaceId = useSpaceIdForList(task.list_id);
    const { data: statuses = [], isLoading: isStatusesLoading } = useStatusesQuery(spaceId);
    const { doneStatus, defaultStatus, setComplete, confirmState, closeConfirm, confirmCascade } =
        useTaskCompletion(task.list_id);

    async function handleChange(newStatusId) {
        const isCompleteTransition = doneStatus && newStatusId === doneStatus.id;
        const isIncompleteTransition =
            doneStatus && defaultStatus && newStatusId === defaultStatus.id && task.status_id === doneStatus.id;

        if (isCompleteTransition || isIncompleteTransition) {
            setPending(true);
            await setComplete(task, flatList, task.list_id, isCompleteTransition);
            setPending(false);
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
                const errorResponseBody = await response.json().catch(() => null);
                const errorMessage = errorResponseBody?.error || 'Failed to update task status';
                console.error('Failed to update task status:', errorMessage);
                toast.error(errorMessage);
                return;
            }

            await queryClient.invalidateQueries({ queryKey: ['tasks', task.list_id] });
            bustPageCache({ urls: [`/lists/${task.list_id}`] });
        } catch (error) {
            console.error('Status update failed:', error);
            toast.error('Failed to update task status');
        } finally {
            setPending(false);
        }
    }

    const currentStatus = statuses.find((status) => status.id === task.status_id);
    // Separates "not resolved yet" from "confirmed no status" to avoid an SSR hydration flash.
    const isResolvingStatus = !spaceId || isStatusesLoading;

    return (
        <>
            <Select value={task.status_id ?? ''} onValueChange={handleChange} disabled={pending}>
                <SelectTrigger className="h-auto border-0 bg-transparent p-0 focus:ring-0 shadow-none w-auto min-w-0 [&>svg]:hidden">
                    <SelectValue>
                        {pending || isResolvingStatus ? (
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
                open={!!confirmState}
                onClose={closeConfirm}
                task={confirmState?.task}
                isComplete={confirmState?.isComplete}
                descendantCount={confirmState?.descendantCount ?? 0}
                onConfirm={confirmCascade}
            />
        </>
    );
}
