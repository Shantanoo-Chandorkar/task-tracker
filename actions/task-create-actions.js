'use server';

import { isDepthAllowed } from '@/lib/nesting-depth';
import {
    blockCreateInSpace,
    blockIfSubtaskCapReached,
    blockIfSublistNotInList,
} from '@/lib/tasks/task-write-guards';
import {
    checkTaskTitle,
    checkTaskDescription,
    checkPriorityFlag,
    nextOccurrenceIso,
} from '@/lib/tasks/task-input';
import { getNextPosition } from '@/lib/tasks/append-position';
import { resolveDepthBelowParent } from '@/lib/tasks/resolve-depth-below-parent';
import { readClientId, findOwnRowById, insertRowOnce } from '@/lib/idempotent-create';
import { withAuthenticatedAction } from '@/lib/auth/with-authenticated-action';
import { toGuestLimitResult } from '@/lib/guest/guest-database-errors';
import { toTaskRateLimitResult } from '@/lib/tasks/task-rate-limit';
import { TASK_DUE_DATE_REQUIRED } from '@/lib/error-codes';
import { getSpaceIdForList } from '@/lib/permissions/space-permissions';
import { attachTagsToTask } from '@/lib/tags/attach-tags-to-task';
import { loadTaskForTagWrite } from '@/lib/tags/load-task-for-tag-write';

/**
 * Checks the fields that need no database read, in the order the caller should hear about them.
 *
 * @param {object} fields - Fields sent to `createTask`
 * @returns {{ failure: { error: string } }|{ title: string, description: string|null }} Cleaned text, or why it failed
 */
function checkCreateFields(fields) {
    const titleCheck = checkTaskTitle(fields.title);
    if (titleCheck.error) return { failure: { error: titleCheck.error } };
    const descriptionCheck = checkTaskDescription(fields.description);
    if (descriptionCheck.error) return { failure: { error: descriptionCheck.error } };

    if (!fields.list_id) return { failure: { error: 'A list is required' } };
    if (fields.sublist_id && fields.parent_id) {
        return { failure: { error: "A subtask can't belong to a sublist directly" } };
    }
    return { title: titleCheck.title, description: descriptionCheck.description };
}

/**
 * Checks what the space and the target rows allow: permission, due date, priority, subtask cap and sublist.
 *
 * @param {object} supabase - Request-scoped Supabase client
 * @param {object} fields - Fields sent to `createTask`
 * @returns {Promise<{ error: string, code?: string }|null>} The refusal, or null to proceed
 * @throws {Error} Generic SERVER_LOAD_FAILED error when a permission or cap read fails
 */
async function blockCreateBySpaceRules(supabase, fields) {
    const spaceId = await getSpaceIdForList(supabase, fields.list_id);
    const permissionBlock = await blockCreateInSpace(supabase, spaceId);
    if (permissionBlock) return permissionBlock;

    const { data: space } = await supabase
        .from('spaces')
        .select('require_due_date')
        .eq('id', spaceId)
        .maybeSingle();
    if (space?.require_due_date && !fields.due_date) {
        return {
            error: 'This space requires a due date on every task',
            code: TASK_DUE_DATE_REQUIRED,
        };
    }

    if (fields.is_prioritised !== undefined) {
        const priorityError = checkPriorityFlag(fields.is_prioritised);
        if (priorityError) return priorityError;
    }

    if (fields.parent_id) {
        const capBlock = await blockIfSubtaskCapReached(supabase, fields.parent_id);
        if (capBlock) return capBlock;
    }

    if (fields.sublist_id) {
        return blockIfSublistNotInList(supabase, fields.sublist_id, fields.list_id);
    }
    return null;
}

/**
 * Uses the position the client sent, or appends the task after its last sibling.
 *
 * @param {object} supabase - Request-scoped Supabase client
 * @param {object} fields - Fields sent to `createTask`
 * @returns {Promise<number>} The position to store
 */
async function resolveNewTaskPosition(supabase, fields) {
    if (fields.position !== undefined && fields.position !== null) return fields.position;
    const siblingFilters = fields.parent_id
        ? { parent_id: fields.parent_id }
        : {
              list_id: fields.list_id,
              parent_id: null,
              sublist_id: fields.sublist_id ?? null,
          };
    return getNextPosition(supabase, 'tasks', siblingFilters, 1);
}

/**
 * Logs a failed task insert and maps it to a user-safe result.
 *
 * @param {{ code?: string, message?: string }} insertError - Error returned by the insert
 * @param {string} listId - List the task was being created in, for the log line
 * @returns {{ data: null, error: string, code?: string }} Guest-limit, write-limit or generic failure
 */
function toCreateTaskFailure(insertError, listId) {
    console.error('[tasks] create failed', {
        listId,
        code: insertError.code,
        detail: insertError.message,
    });
    const guestLimitResult = toGuestLimitResult(insertError);
    if (guestLimitResult) return { data: null, ...guestLimitResult };
    const rateLimitResult = toTaskRateLimitResult(insertError);
    if (rateLimitResult) return { data: null, ...rateLimitResult };
    return { data: null, error: 'Failed to create task' };
}

/**
 * Creates the task for an already signed-in user: validates, checks the space rules and inserts the row.
 *
 * @param {object} user - The signed-in user
 * @param {object} supabase - Request-scoped Supabase client
 * @param {object} fields - Fields sent to `createTask`
 * @returns {Promise<{ data: object|null, error: string|null, code?: string }>} The task, or why not
 */
async function createTaskForUser(user, supabase, fields) {
    const clientId = readClientId(fields);
    if (clientId.failure) return { data: null, ...clientId.failure };
    const replayedTask = await findOwnRowById(
        supabase,
        'tasks',
        clientId.id,
        'created_by',
        user.id,
    );
    if (replayedTask) return { data: replayedTask, error: null };

    const checkedFields = checkCreateFields(fields);
    if (checkedFields.failure) return { data: null, ...checkedFields.failure };

    const spaceRuleBlock = await blockCreateBySpaceRules(supabase, fields);
    if (spaceRuleBlock) return { data: null, ...spaceRuleBlock };

    const depth = await resolveDepthBelowParent(supabase, fields.parent_id);
    // MAX_DEPTH_CONSTANT
    if (!isDepthAllowed(depth)) return { data: null, error: 'Maximum nesting depth reached' };

    const { data: createdTask, error } = await insertRowOnce(
        supabase,
        'tasks',
        {
            title: checkedFields.title,
            description: checkedFields.description,
            status_id: fields.status_id ?? null,
            parent_id: fields.parent_id ?? null,
            sublist_id: fields.parent_id ? null : (fields.sublist_id ?? null),
            list_id: fields.list_id,
            position: await resolveNewTaskPosition(supabase, fields),
            depth,
            due_date: fields.due_date || null,
            is_prioritised: fields.is_prioritised ?? false,
            is_recurring: fields.is_recurring ?? false,
            recurrence_rule: fields.recurrence_rule ?? null,
            next_occurrence:
                fields.is_recurring && fields.recurrence_rule
                    ? nextOccurrenceIso(fields.recurrence_rule)
                    : null,
            created_by: user.id,
        },
        { clientId: clientId.id, ownerColumn: 'created_by', userId: user.id },
    );
    if (error) return toCreateTaskFailure(error, fields.list_id);

    return { data: createdTask, error: null };
}

/**
 * Creates a new task. Computes depth from parent if provided.
 * Appends the task as the last sibling if no position is specified.
 *
 * @param {object} fields
 * @param {string} [fields.id] - Optional client-made UUID; a retry with the same id returns the first try's row
 * @param {string} fields.title - Required task title
 * @param {string} fields.list_id - Required list this task belongs to
 * @param {string} [fields.description]
 * @param {string} [fields.status_id]
 * @param {string|null} [fields.parent_id]
 * @param {string|null} [fields.sublist_id] - Root tasks only; must belong to the same list
 * @param {number} [fields.position]
 * @param {string|null} [fields.due_date] - ISO date string (YYYY-MM-DD), or null
 * @param {boolean} [fields.is_prioritised] - Defaults to false
 * @param {boolean} [fields.is_recurring]
 * @param {object} [fields.recurrence_rule]
 * @returns {{ data: object|null, error: string|null, code: string|undefined }}
 */
export const createTask = withAuthenticatedAction(
    '[tasks] create',
    'Unexpected error creating task',
    createTaskForUser,
);

/**
 * Attaches the chosen tags to a just-saved task, reporting a failure instead of throwing.
 *
 * @param {object} user - The signed-in user
 * @param {object} supabase - Request-scoped Supabase client
 * @param {object} task - The saved task
 * @param {unknown} tagIds - Tag ids sent by the client
 * @returns {Promise<string[]>} Messages for the tags that could not be attached, empty when all went well
 */
async function attachTagsToSavedTask(user, supabase, task, tagIds) {
    try {
        const { spaceId, failure } = await loadTaskForTagWrite(supabase, user, task.id);
        if (failure) return [failure.error];

        const attachResult = await attachTagsToTask(supabase, { taskId: task.id, spaceId, tagIds });
        return attachResult.error ? [attachResult.error] : [];
    } catch (thrown) {
        console.error('[tasks] create with tags: attach threw', {
            taskId: task.id,
            detail: thrown?.message,
        });
        return ['Could not add the tags'];
    }
}

/**
 * Creates a task and attaches the chosen tags with one sign-in and one tag write.
 *
 * A failed tag attach never rolls back the task - the failure is reported in `tagErrors` instead.
 *
 * @param {object} fields - Same fields as `createTask`, plus:
 * @param {string[]} [fields.tagIds] - Ids of existing tags of the space, attached after the task is created
 * @returns {{ data: object|null, error: string|null, tagErrors: string[] }}
 */
export const createTaskWithTags = withAuthenticatedAction(
    '[tasks] create with tags',
    'Unexpected error creating task',
    async (user, supabase, { tagIds, ...taskFields }) => {
        const taskResult = await createTaskForUser(user, supabase, taskFields);
        if (taskResult.error || !taskResult.data) return { ...taskResult, tagErrors: [] };

        const hasTags = Array.isArray(tagIds) && tagIds.length > 0;
        const tagErrors = hasTags
            ? await attachTagsToSavedTask(user, supabase, taskResult.data, tagIds)
            : [];
        return { data: taskResult.data, error: null, tagErrors };
    },
);
