'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import ResponsiveModal from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import RecurrenceBuilder from './RecurrenceBuilder';
import { enqueueOrRun } from '@/lib/offline-queue';
import { Loader } from '@/components/ui/loader';

/**
 * Modal for creating or editing a task, via the shared ResponsiveModal container.
 *
 * @param {object} props
 * @param {boolean} props.open - Whether the dialog is open
 * @param {Function} props.onClose - Called when the dialog should close
 * @param {object|null} [props.task] - Task to edit, or null for create mode
 * @param {string|null} [props.parentId] - Parent ID for new subtask creation
 * @param {string|null} [props.defaultStatusId] - Status to pre-select in create mode
 * @param {string|null} [props.defaultSublistId] - Sublist to pre-select for root-level create mode
 * @param {string} [props.listId] - List the new task belongs to (create mode only)
 */
export default function TaskFormDialog({
    open,
    onClose,
    task = null,
    parentId = null,
    defaultStatusId = null,
    defaultSublistId = null,
    listId = null,
}) {
    const queryClient = useQueryClient();
    const isEditing = Boolean(task);
    const isRootCreate = !isEditing && !parentId;

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [statusId, setStatusId] = useState('');
    const [sublistId, setSublistId] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [isRecurring, setIsRecurring] = useState(false);
    const [recurrenceRule, setRecurrenceRule] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [titleError, setTitleError] = useState('');

    // Reset fields during render (not an effect) to avoid an extra render/flicker on prop change.
    const resetKey = open
        ? `${task?.id ?? 'create'}:${defaultStatusId ?? ''}:${defaultSublistId ?? ''}`
        : null;
    const [lastResetKey, setLastResetKey] = useState(resetKey);
    if (resetKey !== lastResetKey) {
        setLastResetKey(resetKey);
        if (open) {
            setTitle(task?.title ?? '');
            setDescription(task?.description ?? '');
            setStatusId(task?.status_id ?? defaultStatusId ?? '');
            setSublistId(defaultSublistId ?? '');
            setDueDate(task?.due_date ?? '');
            setIsRecurring(task?.is_recurring ?? false);
            setRecurrenceRule(task?.recurrence_rule ?? null);
            setTitleError('');
        }
    }

    const { data: statuses = [] } = useQuery({
        queryKey: ['statuses'],
        queryFn: async () => {
            const response = await fetch('/api/statuses');
            if (!response.ok) throw new Error('Failed to fetch statuses');
            return response.json();
        },
    });

    const { data: sublists = [] } = useQuery({
        queryKey: ['sublists', listId],
        queryFn: async () => {
            const response = await fetch(`/api/sublists?list_id=${listId}`);
            if (!response.ok) throw new Error('Failed to fetch sublists');
            return response.json();
        },
        enabled: isRootCreate && Boolean(listId),
    });

    async function handleSubmit(event) {
        event.preventDefault();

        if (!title.trim()) {
            setTitleError('Title is required');
            return;
        }

        setSubmitting(true);

        const fields = {
            title: title.trim(),
            description: description.trim() || null,
            status_id: statusId || null,
            due_date: dueDate || null,
            parent_id: isEditing ? task.parent_id : (parentId ?? null),
            ...(isEditing ? {} : { list_id: listId, sublist_id: isRootCreate ? sublistId || null : null }),
            is_recurring: isRecurring,
            recurrence_rule: isRecurring ? recurrenceRule : null,
        };

        const targetListId = isEditing ? task.list_id : listId;
        const queryKey = ['tasks', targetListId];
        const previousTasks = queryClient.getQueryData(queryKey);

        let result;
        if (isEditing) {
            // Optimistic patch — the edit is visible immediately regardless of connectivity.
            queryClient.setQueryData(queryKey, (current) =>
                current?.map((existingTask) =>
                    existingTask.id === task.id ? { ...existingTask, ...fields } : existingTask,
                ),
            );
            result = await enqueueOrRun('updateTask', { taskId: task.id, fields });
        } else {
            // Decided on-device so the task can render immediately and, if edited again
            // before it ever syncs, later offline edits reference the same final id.
            const newTaskId = crypto.randomUUID();
            const currentTasks = previousTasks ?? [];

            let depth = 0;
            if (fields.parent_id) {
                const parentTask = currentTasks.find((existingTask) => existingTask.id === fields.parent_id);
                if (parentTask) depth = parentTask.depth + 1;
            }

            const siblingPositions = fields.parent_id
                ? currentTasks
                      .filter((existingTask) => existingTask.parent_id === fields.parent_id)
                      .map((existingTask) => existingTask.position)
                : currentTasks
                      .filter(
                          (existingTask) =>
                              !existingTask.parent_id &&
                              (existingTask.sublist_id ?? null) === (fields.sublist_id ?? null),
                      )
                      .map((existingTask) => existingTask.position);
            const position = siblingPositions.length > 0 ? Math.max(...siblingPositions) + 1 : 1;

            queryClient.setQueryData(queryKey, (current) => [
                ...(current ?? []),
                {
                    id: newTaskId,
                    ...fields,
                    depth,
                    position,
                    next_occurrence: null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                },
            ]);

            result = await enqueueOrRun('createTask', { fields: { ...fields, id: newTaskId } });
        }

        setSubmitting(false);

        if (result.error) {
            // A genuine rejection (not a network-level queue) never actually applied —
            // don't leave the optimistic change showing something that didn't happen.
            queryClient.setQueryData(queryKey, previousTasks);
            setTitleError(result.error);
            return;
        }

        if (result.queued) {
            toast.success("Saved — will sync when you're back online");
        } else {
            await queryClient.invalidateQueries({ queryKey: ['tasks'] });
        }

        onClose();
    }

    return (
        <ResponsiveModal open={open} onClose={onClose} title={isEditing ? 'Edit Task' : 'New Task'}>
            <form onSubmit={handleSubmit} className="space-y-4 mt-2">
                {/* Title */}
                <div className="space-y-1">
                    <Input
                        value={title}
                        onChange={(event) => {
                            setTitle(event.target.value);
                            setTitleError('');
                        }}
                        placeholder="Task title"
                        autoFocus
                    />
                    {titleError && <p className="text-xs text-destructive">{titleError}</p>}
                </div>

                {/* Description */}
                <Textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Description (optional)"
                    rows={3}
                />

                {/* Status */}
                <Select value={statusId} onValueChange={setStatusId}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select status..." />
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

                {/* Sublist — root-level tasks only */}
                {isRootCreate && sublists.length > 0 && (
                    <Select
                        value={sublistId || 'none'}
                        onValueChange={(value) => setSublistId(value === 'none' ? '' : value)}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="No sublist" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">No sublist</SelectItem>
                            {sublists.map((sublist) => (
                                <SelectItem key={sublist.id} value={sublist.id}>
                                    <span className="flex items-center gap-2">
                                        <span
                                            className="h-2 w-2 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: sublist.color }}
                                        />
                                        {sublist.name}
                                    </span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}

                {/* Due date */}
                <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Due date</label>
                    <Input
                        type="date"
                        value={dueDate}
                        onChange={(event) => setDueDate(event.target.value)}
                        className="w-fit"
                    />
                </div>

                {/* Recurrence toggle */}
                <div className="space-y-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={isRecurring}
                            onChange={(event) => setIsRecurring(event.target.checked)}
                            className="rounded border-border"
                        />
                        <span className="text-sm text-foreground">Recurring task</span>
                    </label>

                    {/* RecurrenceBuilder — shown only when recurring is enabled */}
                    {isRecurring && (
                        <RecurrenceBuilder value={recurrenceRule} onChange={setRecurrenceRule} />
                    )}
                </div>

                {/* Submit */}
                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={submitting} className="gap-1.5">
                        {submitting && <Loader size="xs" />}
                        {submitting ? 'Saving...' : isEditing ? 'Save changes' : 'Create task'}
                    </Button>
                </div>
            </form>
        </ResponsiveModal>
    );
}
