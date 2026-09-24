'use client';

import { useId, useState } from 'react';
import dynamic from 'next/dynamic';
import { useQueryClient } from '@tanstack/react-query';
import { useStatusesQuery } from '@/hooks/useStatusesQuery';
import { useSublistsQuery } from '@/hooks/useSublistsQuery';
import { useSpaceIdForList } from '@/hooks/useSpaceIdForList';
import ModalShell from '@/components/ui/modal-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import CharLimitField from '@/components/ui/CharLimitField';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import RecurrenceBuilder from './RecurrenceBuilder';
import { createTask, updateTask } from '@/actions/task-actions';
import { Loader } from '@/components/ui/loader';
import { toast } from 'sonner';
import { bustPageCache } from '@/lib/service-worker-cache';

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 10000;

// Tiptap is heavy and only needed once this dialog actually opens - keeps it out of the list page's initial bundle.
const RichTextEditor = dynamic(() => import('@/components/ui/RichTextEditor'), {
    ssr: false,
    loading: () => (
        <div className="flex min-h-[200px] items-center justify-center">
            <Loader />
        </div>
    ),
});

/**
 * Modal for creating or editing a task, via the shared ModalShell container.
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
    const formId = useId();
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
    const [formError, setFormError] = useState('');

    const spaceId = useSpaceIdForList(listId ?? task?.list_id);
    const { data: statuses = [] } = useStatusesQuery(spaceId);

    // Reset fields during render (not an effect) to avoid an extra render/flicker on prop change.
    const resetKey = open
        ? `${task?.id ?? 'create'}:${defaultStatusId ?? ''}:${defaultSublistId ?? ''}`
        : null;
    const [lastResetKey, setLastResetKey] = useState(resetKey);
    if (resetKey !== lastResetKey) {
        setLastResetKey(resetKey);
        if (open) {
            const fallbackStatus = statuses.find((status) => status.is_default);
            setTitle(task?.title ?? '');
            setDescription(task?.description ?? '');
            setStatusId(task?.status_id ?? defaultStatusId ?? fallbackStatus?.id ?? '');
            setSublistId(defaultSublistId ?? '');
            setDueDate(task?.due_date ?? '');
            setIsRecurring(task?.is_recurring ?? false);
            setRecurrenceRule(task?.recurrence_rule ?? null);
            setTitleError('');
            setFormError('');
        }
    }

    const { data: sublists = [] } = useSublistsQuery(listId, {
        enabled: isRootCreate && Boolean(listId),
    });

    async function handleSubmit(event) {
        event.preventDefault();

        if (!title.trim()) {
            setTitleError('Title is required');
            return;
        }

        setFormError('');
        setSubmitting(true);

        const fields = {
            title: title.trim(),
            description: description.trim() || null,
            status_id: statusId || null,
            due_date: dueDate || null,
            parent_id: isEditing ? task.parent_id : (parentId ?? null),
            ...(isEditing
                ? {}
                : { list_id: listId, sublist_id: isRootCreate ? sublistId || null : null }),
            is_recurring: isRecurring,
            recurrence_rule: isRecurring ? recurrenceRule : null,
        };

        try {
            const { error } = isEditing
                ? await updateTask(task.id, fields)
                : await createTask(fields);

            if (error) {
                setFormError(error);
                toast.error(isEditing ? 'Failed to update task' : 'Failed to create task');
                return;
            }

            toast.success(isEditing ? 'Task updated successfully' : 'Task created successfully');
            onClose();
            // Not awaited - the dialog closes immediately instead of blocking on this refetch.
            queryClient.invalidateQueries({ queryKey: ['tasks', listId ?? task?.list_id] });
            // A new task changes the list's total count - the sidebar's ['lists'] query needs telling.
            if (!isEditing) queryClient.invalidateQueries({ queryKey: ['lists'] });
            bustPageCache({ urls: [`/lists/${listId ?? task?.list_id}`] });
        } catch {
            // A rejected server action means the request never completed (offline, server down)
            const message = 'Could not save. Check your connection and try again.';
            setFormError(message);
            toast.error(message);
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <ModalShell
            open={open}
            onClose={onClose}
            title={isEditing ? 'Edit Task' : 'New Task'}
            footer={
                <>
                    <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button type="submit" form={formId} disabled={submitting} className="gap-1.5">
                        {submitting && <Loader size="xs" />}
                        {submitting ? 'Saving...' : isEditing ? 'Save changes' : 'Create task'}
                    </Button>
                </>
            }
        >
            <form id={formId} onSubmit={handleSubmit} className="space-y-4 mt-2 min-w-0">
                {/* Title */}
                <CharLimitField
                    label="Task title"
                    currentLength={title.length}
                    maxLength={TITLE_MAX}
                    error={titleError}
                >
                    <Input
                        value={title}
                        onChange={(event) => {
                            setTitle(event.target.value);
                            setTitleError('');
                        }}
                        placeholder="Task title"
                        maxLength={TITLE_MAX}
                    />
                </CharLimitField>

                {/* Description */}
                <CharLimitField
                    label="Description (optional)"
                    currentLength={description.length}
                    maxLength={DESCRIPTION_MAX}
                >
                    <RichTextEditor
                        value={description}
                        onChange={setDescription}
                        maxLength={DESCRIPTION_MAX}
                        placeholder="Description (optional)"
                    />
                </CharLimitField>

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

                {/* Sublist - root-level tasks only */}
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

                    {/* RecurrenceBuilder - shown only when recurring is enabled */}
                    {isRecurring && (
                        <RecurrenceBuilder value={recurrenceRule} onChange={setRecurrenceRule} />
                    )}
                </div>

                {formError && <p className="text-xs text-destructive">{formError}</p>}
            </form>
        </ModalShell>
    );
}
