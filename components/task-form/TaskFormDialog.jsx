'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { createTask, updateTask } from '@/actions/task-actions';

/**
 * Modal dialog for creating or editing a task.
 * In create mode: inserts a new task under the given parentId (or root if null).
 * In edit mode: updates the existing task's fields.
 *
 * @param {object} props
 * @param {boolean} props.open - Whether the dialog is open
 * @param {Function} props.onClose - Called when the dialog should close
 * @param {object|null} [props.task] - Task to edit, or null for create mode
 * @param {string|null} [props.parentId] - Parent ID for new subtask creation
 */
export default function TaskFormDialog({ open, onClose, task = null, parentId = null }) {
    const queryClient = useQueryClient();
    const isEditing = Boolean(task);

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [statusId, setStatusId] = useState('');
    const [isRecurring, setIsRecurring] = useState(false);
    const [recurrenceRule, setRecurrenceRule] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [titleError, setTitleError] = useState('');

    // Reset form fields when the dialog opens or the task prop changes
    useEffect(() => {
        if (open) {
            setTitle(task?.title ?? '');
            setDescription(task?.description ?? '');
            setStatusId(task?.status_id ?? '');
            setIsRecurring(task?.is_recurring ?? false);
            setRecurrenceRule(task?.recurrence_rule ?? null);
            setTitleError('');
        }
    }, [open, task]);

    const { data: statuses = [] } = useQuery({
        queryKey: ['statuses'],
        queryFn: async () => {
            const res = await fetch('/api/statuses');
            if (!res.ok) throw new Error('Failed to fetch statuses');
            return res.json();
        },
    });

    async function handleSubmit(e) {
        e.preventDefault();

        if (!title.trim()) {
            setTitleError('Title is required');
            return;
        }

        setSubmitting(true);

        const fields = {
            title: title.trim(),
            description: description.trim() || null,
            status_id: statusId || null,
            parent_id: isEditing ? task.parent_id : (parentId ?? null),
            is_recurring: isRecurring,
            recurrence_rule: isRecurring ? recurrenceRule : null,
        };

        const { error } = isEditing ? await updateTask(task.id, fields) : await createTask(fields);

        setSubmitting(false);

        if (error) {
            setTitleError(error);
            return;
        }

        await queryClient.invalidateQueries({ queryKey: ['tasks'] });
        onClose();
    }

    return (
        <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>{isEditing ? 'Edit Task' : 'New Task'}</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 mt-2">
                    {/* Title */}
                    <div className="space-y-1">
                        <Input
                            value={title}
                            onChange={(e) => {
                                setTitle(e.target.value);
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
                        onChange={(e) => setDescription(e.target.value)}
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

                    {/* Recurrence toggle */}
                    <div className="space-y-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={isRecurring}
                                onChange={(e) => setIsRecurring(e.target.checked)}
                                className="rounded border-border"
                            />
                            <span className="text-sm text-foreground">Recurring task</span>
                        </label>

                        {/* RecurrenceBuilder — shown only when recurring is enabled */}
                        {isRecurring && (
                            <RecurrenceBuilder
                                value={recurrenceRule}
                                onChange={setRecurrenceRule}
                            />
                        )}
                    </div>

                    {/* Submit */}
                    <div className="flex justify-end gap-2 pt-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                            disabled={submitting}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={submitting}>
                            {submitting ? 'Saving...' : isEditing ? 'Save changes' : 'Create task'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
