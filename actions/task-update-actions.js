'use server';

import { recurrenceRulesMatch } from '@/lib/tasks/recurrence';
import { blockWriteInSpace, blockIfSublistNotInList } from '@/lib/tasks/task-write-guards';
import {
    checkTaskTitle,
    checkTaskDescription,
    checkPriorityFlag,
    pickTaskUpdates,
    nextOccurrenceIso,
} from '@/lib/tasks/task-input';
import { canMarkTaskDone } from '@/lib/tasks/task-completion';
import { withAuthenticatedAction } from '@/lib/auth/with-authenticated-action';
import { toTaskRateLimitResult } from '@/lib/tasks/task-rate-limit';
import { isValidVersionStamp, buildEditConflictMessage } from '@/lib/tasks/task-edit-conflict';
import {
    TASK_DUE_DATE_REQUIRED,
    TASK_EDIT_CONFLICT,
    TASK_VERSION_INVALID,
} from '@/lib/error-codes';

/**
 * Cleans the title, priority and description the client sent, in the order the caller should hear about problems.
 *
 * @param {object} pickedUpdates - Allowlisted fields from `pickTaskUpdates`
 * @returns {{ failure: { error: string, code?: string } }|{ updates: object }} Cleaned fields, or why one failed
 */
function cleanUpdateFields(pickedUpdates) {
    const updates = { ...pickedUpdates };

    if ('title' in updates) {
        const titleCheck = checkTaskTitle(updates.title);
        if (titleCheck.error) return { failure: { error: titleCheck.error } };
        updates.title = titleCheck.title;
    }

    if ('is_prioritised' in updates) {
        const priorityError = checkPriorityFlag(updates.is_prioritised);
        if (priorityError) return { failure: priorityError };
    }

    if ('description' in updates) {
        const descriptionCheck = checkTaskDescription(updates.description);
        if (descriptionCheck.error) return { failure: { error: descriptionCheck.error } };
        updates.description = descriptionCheck.description;
    }

    return { updates };
}

/**
 * Refuses marking a task done while any of its subtasks is not done.
 *
 * @param {object} supabase - Request-scoped Supabase client
 * @param {string} taskId - Task being updated
 * @param {string} statusId - Status the task is being moved to
 * @returns {Promise<{ error: string }|null>} The refusal, or null to proceed
 */
async function blockDoneWithOpenSubtasks(supabase, taskId, statusId) {
    // Statuses are per-space, so the target status's own code is read; there is no single global done id
    const { data: targetStatus } = await supabase
        .from('statuses')
        .select('code')
        .eq('id', statusId)
        .single();
    if (targetStatus?.code !== 'done') return null;

    const canComplete = await canMarkTaskDone(supabase, taskId, statusId);
    if (canComplete) return null;
    return { error: 'Complete all subtasks before marking this task done' };
}

/**
 * Refuses moving a task into a sublist when it is a subtask or the sublist belongs to another list.
 *
 * @param {object} supabase - Request-scoped Supabase client
 * @param {string} taskId - Task being updated
 * @param {string} sublistId - Sublist the task is being placed in
 * @returns {Promise<{ error: string }|null>} The refusal, or null to proceed
 */
async function blockInvalidSublistChange(supabase, taskId, sublistId) {
    const { data: currentTask } = await supabase
        .from('tasks')
        .select('parent_id, list_id')
        .eq('id', taskId)
        .single();
    if (currentTask?.parent_id) return { error: "A subtask can't belong to a sublist directly" };
    return blockIfSublistNotInList(supabase, sublistId, currentTask?.list_id);
}

/**
 * Adds the recurrence bookkeeping an update needs: a restarted count for a new schedule, and the next due date.
 *
 * @param {object} updates - Cleaned fields about to be written
 * @param {object} existingTask - The task row before this update
 * @returns {object} The updates, plus `recurrence_spawned_count` and `next_occurrence` where they apply
 */
function withRecurrenceSchedule(updates, existingTask) {
    if (updates.is_recurring === false) return { ...updates, next_occurrence: null };
    if (!updates.is_recurring || !updates.recurrence_rule) return updates;

    // A new or edited schedule starts its count again; an unrelated edit must not extend a limited series
    const isNewSchedule =
        !existingTask.is_recurring ||
        !recurrenceRulesMatch(existingTask.recurrence_rule, updates.recurrence_rule);
    const scheduledUpdates = isNewSchedule ? { ...updates, recurrence_spawned_count: 0 } : updates;

    return {
        ...scheduledUpdates,
        next_occurrence: nextOccurrenceIso(
            updates.recurrence_rule,
            scheduledUpdates.recurrence_spawned_count ?? existingTask.recurrence_spawned_count ?? 0,
        ),
    };
}

/**
 * Logs a failed task update and maps it to a user-safe result.
 *
 * @param {string} taskId - Task being updated, for the log line
 * @param {object} updates - Fields that were being written, logged by name only
 * @param {{ code?: string, message?: string }|null} updateError - Error from the update, null when no row came back
 * @returns {{ data: null, error: string, code?: string }} Write-limit or generic failure
 */
function toUpdateTaskFailure(taskId, updates, updateError) {
    console.error('[tasks] update failed', {
        taskId,
        fields: Object.keys(updates),
        code: updateError?.code,
        detail: updateError?.message,
    });
    const rateLimitResult = toTaskRateLimitResult(updateError);
    if (rateLimitResult) return { data: null, ...rateLimitResult };
    return { data: null, error: 'Failed to update task' };
}

/**
 * Refuses a version stamp that is not a real timestamp, so it never reaches the database filter.
 *
 * @param {unknown} expectedUpdatedAt - Stamp the client sent, or nothing
 * @returns {{ data: null, error: string, code: string }|null} The refusal, or null when absent or valid
 */
function blockInvalidVersionStamp(expectedUpdatedAt) {
    if (expectedUpdatedAt === undefined || expectedUpdatedAt === null) return null;
    if (isValidVersionStamp(expectedUpdatedAt)) return null;
    return { data: null, error: 'The task version is not valid', code: TASK_VERSION_INVALID };
}

/**
 * Explains why a version-checked update changed no row: the task is gone, or it changed after the client loaded it.
 *
 * @param {object} supabase - Request-scoped Supabase client
 * @param {string} taskId - Task being updated
 * @returns {Promise<{ data: object|null, error: string, code?: string, currentTask?: object }>} The refusal
 */
async function describeRefusedVersionedUpdate(supabase, taskId) {
    const { data: currentTask } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .maybeSingle();
    if (!currentTask) return { data: null, error: 'Task not found' };

    // Write permission was checked before this point, so showing the stored row leaks nothing new
    return {
        data: null,
        error: buildEditConflictMessage([]),
        code: TASK_EDIT_CONFLICT,
        currentTask,
    };
}

/**
 * Writes the update; with a version stamp it only applies if the task is still at that version.
 *
 * @param {object} supabase - Request-scoped Supabase client
 * @param {string} taskId - Task being updated
 * @param {object} updates - Cleaned fields to write
 * @param {string|undefined} expectedUpdatedAt - Version the client loaded, or nothing to overwrite regardless
 * @returns {Promise<{ data: object|null, error: string|null, code?: string, currentTask?: object }>} The saved row
 */
async function saveTaskUpdate(supabase, taskId, updates, expectedUpdatedAt) {
    const isVersionChecked = expectedUpdatedAt !== undefined && expectedUpdatedAt !== null;
    let updateQuery = supabase.from('tasks').update(updates).eq('id', taskId);
    // The database compares the stamp, so the check and the write are one step and cannot race
    if (isVersionChecked) updateQuery = updateQuery.eq('updated_at', expectedUpdatedAt);

    const { data: updatedTask, error } = await updateQuery.select().maybeSingle();
    if (error) return toUpdateTaskFailure(taskId, updates, error);
    if (updatedTask) return { data: updatedTask, error: null };
    if (isVersionChecked) return describeRefusedVersionedUpdate(supabase, taskId);
    return toUpdateTaskFailure(taskId, updates, null);
}

/**
 * Updates specific fields on an existing task.
 *
 * @param {string} taskId - Task ID to update
 * @param {object} fields - Partial task fields to update
 * @param {object} [options]
 * @param {string} [options.expectedUpdatedAt] - The `updated_at` the caller loaded; a newer task is refused with
 *   `TASK_EDIT_CONFLICT` and returned as `currentTask`. Leave out to overwrite regardless.
 * @returns {{ data: object|null, error: string|null, code: string|undefined, currentTask: object|undefined }}
 */
export const updateTask = withAuthenticatedAction(
    '[tasks] update',
    'Unexpected error updating task',
    async (user, supabase, taskId, fields, options = {}) => {
        if (!taskId) return { data: null, error: 'Task ID is required' };

        const { data: existingTask } = await supabase
            .from('tasks')
            .select(
                'created_by, is_recurring, recurrence_rule, recurrence_spawned_count, lists(space_id, spaces(require_due_date))',
            )
            .eq('id', taskId)
            .maybeSingle();
        if (!existingTask) return { data: null, error: 'Task not found' };

        const permissionBlock = await blockWriteInSpace(
            supabase,
            existingTask.lists?.space_id,
            user.id,
            existingTask.created_by,
        );
        if (permissionBlock) return { data: null, ...permissionBlock };

        const versionBlock = blockInvalidVersionStamp(options?.expectedUpdatedAt);
        if (versionBlock) return versionBlock;

        if (fields.due_date === null && existingTask.lists?.spaces?.require_due_date) {
            return {
                data: null,
                error: 'This space requires a due date on every task',
                code: TASK_DUE_DATE_REQUIRED,
            };
        }

        const cleanedFields = cleanUpdateFields(pickTaskUpdates(fields));
        if (cleanedFields.failure) return { data: null, ...cleanedFields.failure };

        if (cleanedFields.updates.status_id) {
            const doneBlock = await blockDoneWithOpenSubtasks(
                supabase,
                taskId,
                cleanedFields.updates.status_id,
            );
            if (doneBlock) return { data: null, ...doneBlock };
        }

        if (cleanedFields.updates.sublist_id) {
            const sublistBlock = await blockInvalidSublistChange(
                supabase,
                taskId,
                cleanedFields.updates.sublist_id,
            );
            if (sublistBlock) return { data: null, ...sublistBlock };
        }

        const updates = withRecurrenceSchedule(cleanedFields.updates, existingTask);
        return saveTaskUpdate(supabase, taskId, updates, options?.expectedUpdatedAt);
    },
);
