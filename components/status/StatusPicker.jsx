'use client';

import { useId, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
import { useGetTasks } from '@/hooks/useTasksQuery';
import { bustPageCache } from '@/lib/service-worker-cache';

/**
 * Inline status dropdown for changing a task's status directly from the task row.
 * Picking a status that changes done-ness routes through the shared cascade-confirm flow, both directions.
 *
 * @param {object} props
 * @param {object} props.task - The task whose status is being shown/changed
 * @param {ReturnType<typeof import('@/hooks/useTaskCompletion').useTaskCompletion>} props.completion - The row's
 *   shared completion state, which also supplies the statuses; its owner renders the cascade dialog
 */
export default function StatusPicker({ task, completion }) {
    const queryClient = useQueryClient();
    const getTasks = useGetTasks(task.list_id);
    const [pending, setPending] = useState(false);
    // Radix Select builds every option up front, so a plain trigger stands in until first use
    const [isSelectBuilt, setIsSelectBuilt] = useState(false);
    const [isSelectOpen, setIsSelectOpen] = useState(false);
    const listboxId = useId();
    const { statuses, isResolvingStatuses, doneStatus, defaultStatus, setComplete } = completion;

    async function handleChange(newStatusId) {
        const isCompleteTransition = doneStatus && newStatusId === doneStatus.id;
        const isIncompleteTransition =
            doneStatus &&
            defaultStatus &&
            newStatusId === defaultStatus.id &&
            task.status_id === doneStatus.id;

        if (isCompleteTransition || isIncompleteTransition) {
            setPending(true);
            await setComplete(task, getTasks(), task.list_id, isCompleteTransition);
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
                toast.error(errorMessage);
                return;
            }

            await queryClient.invalidateQueries({ queryKey: ['tasks', task.list_id] });
            bustPageCache({ urls: [`/lists/${task.list_id}`] });
        } catch {
            toast.error('Failed to update task status');
        } finally {
            setPending(false);
        }
    }

    const currentStatus = statuses.find((status) => status.id === task.status_id);
    const statusDisplay =
        pending || isResolvingStatuses ? (
            <Loader size="xs" className="text-muted-foreground" />
        ) : currentStatus ? (
            <StatusBadge name={currentStatus.name} color={currentStatus.color} />
        ) : (
            <span className="text-xs text-muted-foreground">No status</span>
        );

    function openSelect() {
        setIsSelectBuilt(true);
        setIsSelectOpen(true);
    }

    if (!isSelectBuilt) {
        return (
            <button
                type="button"
                role="combobox"
                aria-expanded="false"
                aria-haspopup="listbox"
                aria-controls={listboxId}
                disabled={pending}
                onClick={openSelect}
                onKeyDown={(keyEvent) => {
                    if (keyEvent.key === 'ArrowDown' || keyEvent.key === 'ArrowUp') {
                        keyEvent.preventDefault();
                        openSelect();
                    }
                }}
                className="flex w-auto min-w-0 items-center rounded-lg bg-transparent p-0 text-sm whitespace-nowrap outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {statusDisplay}
            </button>
        );
    }

    return (
        <Select
            value={task.status_id ?? ''}
            onValueChange={handleChange}
            disabled={pending}
            open={isSelectOpen}
            onOpenChange={setIsSelectOpen}
        >
            <SelectTrigger className="h-auto border-0 bg-transparent p-0 focus:ring-0 shadow-none w-auto min-w-0 [&>svg]:hidden">
                <SelectValue>{statusDisplay}</SelectValue>
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
    );
}
