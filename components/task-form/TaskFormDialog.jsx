'use client';

import { useId, useState } from 'react';
import dynamic from 'next/dynamic';
import { useQueryClient } from '@tanstack/react-query';
import { useStatusesQuery } from '@/hooks/useStatusesQuery';
import { useSublistsQuery } from '@/hooks/useSublistsQuery';
import { useSpaceIdForList } from '@/hooks/useSpaceIdForList';
import { useSpaceById } from '@/hooks/useSpaceById';
import ModalShell from '@/components/ui/modal-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import CharLimitField from '@/components/ui/CharLimitField';
import FormError from '@/components/ui/FormError';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import RecurrenceBuilder from './RecurrenceBuilder';
import StagedTagPicker from './StagedTagPicker';
import TaskTagPicker from '@/components/task-detail/TaskTagPicker';
import LabeledField from '@/components/ui/LabeledField';
import { createTaskWithTags, updateTask } from '@/actions/task-actions';
import { TASK_DUE_DATE_REQUIRED } from '@/lib/error-codes';
import { Loader } from '@/components/ui/loader';
import EditorErrorBoundary from '@/components/ui/EditorErrorBoundary';
import { toast } from 'sonner';
import { bustPageCache } from '@/lib/service-worker-cache';
import { withSavedRow, withStatusDisplay } from '@/lib/query-cache';
import { createClientId } from '@/lib/client-id';

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
    const [tagNames, setTagNames] = useState([]);
    const [dueDate, setDueDate] = useState('');
    const [isPrioritised, setIsPrioritised] = useState(false);
    const [isRecurring, setIsRecurring] = useState(false);
    const [recurrenceRule, setRecurrenceRule] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    // Made when the dialog opens and kept for retries, so a retry after a lost reply cannot create a second task
    const [createRequestId, setCreateRequestId] = useState(() => createClientId());
    const [titleError, setTitleError] = useState('');
    const [dueDateError, setDueDateError] = useState('');
    const [formError, setFormError] = useState('');

    const spaceId = useSpaceIdForList(listId ?? task?.list_id);
    const requiresDueDate = useSpaceById(spaceId)?.require_due_date ?? false;
    const { data: statuses = [] } = useStatusesQuery(spaceId);

    // Reset fields during render (not an effect) to avoid an extra render/flicker on prop change.
    const resetKey = open
        ? `${task?.id ?? 'create'}:${defaultStatusId ?? ''}:${defaultSublistId ?? ''}`
        : null;
    // Starts null so a dialog first mounted already open still fills its fields from `task`
    const [lastResetKey, setLastResetKey] = useState(null);
    if (resetKey !== lastResetKey) {
        setLastResetKey(resetKey);
        if (open) {
            const fallbackStatus = statuses.find((status) => status.is_default);
            setTitle(task?.title ?? '');
            setDescription(task?.description ?? '');
            setStatusId(task?.status_id ?? defaultStatusId ?? fallbackStatus?.id ?? '');
            setSublistId(defaultSublistId ?? '');
            setTagNames([]);
            setDueDate(task?.due_date ?? '');
            setIsPrioritised(task?.is_prioritised ?? false);
            setIsRecurring(task?.is_recurring ?? false);
            setRecurrenceRule(task?.recurrence_rule ?? null);
            setTitleError('');
            setDueDateError('');
            setFormError('');
            setSubmitting(false);
            setCreateRequestId(createClientId());
        }
    }

    const { data: sublists = [] } = useSublistsQuery(listId, {
        enabled: isRootCreate && Boolean(listId),
    });

    async function handleSubmit(event) {
        event.preventDefault();
        if (submitting) return;

        if (!title.trim()) {
            setTitleError('Title is required');
            return;
        }

        if (requiresDueDate && !dueDate) {
            setDueDateError('This space requires a due date');
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
                : {
                      ...(createRequestId && { id: createRequestId }),
                      list_id: listId,
                      sublist_id: isRootCreate ? sublistId || null : null,
                      tagNames,
                  }),
            is_prioritised: isPrioritised,
            is_recurring: isRecurring,
            recurrence_rule: isRecurring ? recurrenceRule : null,
        };

        try {
            const {
                data: savedTask,
                error,
                code,
                tagErrors,
            } = isEditing ? await updateTask(task.id, fields) : await createTaskWithTags(fields);

            if (error) {
                if (code === TASK_DUE_DATE_REQUIRED) {
                    setDueDateError(error);
                } else {
                    setFormError(error);
                }
                toast.error(isEditing ? 'Failed to update task' : 'Failed to create task');
                setSubmitting(false);
                return;
            }

            toast.success(isEditing ? 'Task updated successfully' : 'Task created successfully');
            if (tagErrors?.length) {
                toast.info(`Task saved, but couldn't add: ${tagErrors.join(', ')}`);
            }
            // No unlock on success: the dialog stays on screen while it animates out, and the next open resets it.
            onClose();
            const taskListId = listId ?? task?.list_id;
            if (savedTask) {
                queryClient.setQueryData(['tasks', taskListId], (cachedTasks) =>
                    withSavedRow(cachedTasks, withStatusDisplay(savedTask, statuses), isEditing, {
                        tags: [],
                    }),
                );
            }
            // Not awaited - the dialog closes immediately instead of blocking on this refetch.
            queryClient.invalidateQueries({ queryKey: ['tasks', taskListId] });
            // A new task changes the list's total count - the sidebar's ['lists'] query needs telling.
            if (!isEditing) queryClient.invalidateQueries({ queryKey: ['lists'] });
            bustPageCache({ urls: [`/lists/${listId ?? task?.list_id}`] });
        } catch {
            // A rejected server action means the request never completed (offline, server down)
            const message = 'Could not save. Check your connection and try again.';
            setFormError(message);
            toast.error(message);
            setSubmitting(false);
        }
    }

    return (
        <ModalShell
            open={open}
            onClose={onClose}
            isBusy={submitting}
            title={isEditing ? 'Edit Task' : 'New Task'}
            contentClassName="sm:max-w-3xl"
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
            {/* inert locks every field at once while saving, so nothing can be edited under an in-flight write */}
            <form
                id={formId}
                onSubmit={handleSubmit}
                inert={submitting}
                className="space-y-4 mt-2 min-w-0"
            >
                {/* Title */}
                <CharLimitField
                    label="Task title"
                    currentLength={title.length}
                    maxLength={TITLE_MAX}
                    error={titleError}
                >
                    {(titleControlProps) => (
                        <Input
                            {...titleControlProps}
                            value={title}
                            onChange={(event) => {
                                setTitle(event.target.value);
                                setTitleError('');
                            }}
                            placeholder="Task title"
                            maxLength={TITLE_MAX}
                        />
                    )}
                </CharLimitField>

                {/* Description */}
                <CharLimitField
                    label="Description (optional)"
                    currentLength={description.length}
                    maxLength={DESCRIPTION_MAX}
                >
                    {() => (
                        <EditorErrorBoundary
                            value={description}
                            onChange={setDescription}
                            maxLength={DESCRIPTION_MAX}
                            placeholder="Description (optional)"
                        >
                            <RichTextEditor
                                value={description}
                                onChange={setDescription}
                                maxLength={DESCRIPTION_MAX}
                                placeholder="Description (optional)"
                                ariaLabel="Description"
                            />
                        </EditorErrorBoundary>
                    )}
                </CharLimitField>

                {/* 2-column grid - stacking these four full-width each wastes space on wider screens */}
                <div className="grid grid-cols-2 gap-4">
                    {/* Status */}
                    <LabeledField label="Status">
                        {({ controlId }) => (
                            <Select value={statusId} onValueChange={setStatusId}>
                                <SelectTrigger id={controlId}>
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
                        )}
                    </LabeledField>

                    {/* Tags */}
                    <LabeledField label="Tags">
                        {({ labelId }) => (
                            <div role="group" aria-labelledby={labelId}>
                                {isEditing ? (
                                    <TaskTagPicker task={task} spaceId={spaceId} isFieldSized />
                                ) : (
                                    <StagedTagPicker
                                        spaceId={spaceId}
                                        tagNames={tagNames}
                                        onChange={setTagNames}
                                    />
                                )}
                            </div>
                        )}
                    </LabeledField>

                    {/* Sublist - root-level tasks only */}
                    {isRootCreate && sublists.length > 0 && (
                        <LabeledField label="Sublist">
                            {({ controlId }) => (
                                <Select
                                    value={sublistId || 'none'}
                                    onValueChange={(value) =>
                                        setSublistId(value === 'none' ? '' : value)
                                    }
                                >
                                    <SelectTrigger id={controlId}>
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
                        </LabeledField>
                    )}

                    {/* Due date */}
                    <LabeledField label={requiresDueDate ? 'Due date *' : 'Due date'}>
                        {({ controlId }) => (
                            <>
                                <Input
                                    id={controlId}
                                    type="date"
                                    value={dueDate}
                                    aria-required={requiresDueDate ? true : undefined}
                                    aria-invalid={dueDateError ? true : undefined}
                                    aria-describedby={
                                        dueDateError ? `${controlId}-error` : undefined
                                    }
                                    onChange={(event) => {
                                        setDueDate(event.target.value);
                                        setDueDateError('');
                                    }}
                                />
                                <FormError errorId={`${controlId}-error`}>{dueDateError}</FormError>
                            </>
                        )}
                    </LabeledField>
                </div>

                {/* Priority toggle - a plain column, so unlike tags it needs no step after create */}
                <label className="flex items-center gap-2 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={isPrioritised}
                        onChange={(event) => setIsPrioritised(event.target.checked)}
                        className="rounded border-border"
                    />
                    <span className="text-sm text-foreground">Put on priority</span>
                </label>

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
