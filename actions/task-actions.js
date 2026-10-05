'use server';

import { createClient } from '@/lib/supabase/server';
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows';
import { throwIfQueryFailed } from '@/lib/supabase/throw-if-query-failed';
import {
    wouldCreateCycle,
    exceedsMaxDepthAfterMove,
    resolveRootAncestorSublistId,
} from '@/lib/move-task-checks';
import { computeNextOccurrence, recurrenceRulesMatch } from '@/lib/recurrence';
import { getNestingMode, isDepthAllowed, FINITE_MAX_DEPTH } from '@/lib/config';
import { findAncestors, findDescendantIds, deepCloneSubtree } from '@/lib/tree';
import { getPositionBetween } from '@/lib/fractional-index';
import { getNextPosition } from '@/lib/position';
import {
    readClientId,
    findOwnRowById,
    insertRowOnce,
    isUniqueViolation,
} from '@/lib/idempotent-create';
import {
    canMarkTaskDone,
    getDefaultStatusId,
    getDoneStatusId,
    getTaskListTree,
} from '@/lib/task-completion';
import { getCurrentUser } from '@/lib/auth/session';
import { withAuthenticatedAction } from '@/lib/auth/with-authenticated-action';
import { toGuestLimitResult } from '@/lib/guest/guest-database-errors';
import { toTaskRateLimitResult } from '@/lib/task-rate-limit';
import {
    NOT_AUTHENTICATED,
    TASK_INVALID_PRIORITY,
    TASK_DUE_DATE_REQUIRED,
    TASK_SUBTASK_CAP_REACHED,
    TASK_MOVE_CYCLE,
    TASK_MOVE_FORBIDDEN_DESCENDANTS,
    TASK_MOVE_FAILED,
    TASK_NOT_FOUND,
    TASK_DUPLICATE_FAILED,
    TASK_REPARENT_FORBIDDEN_CHILDREN,
    TASK_REPARENT_DELETE_FAILED,
    TAG_ALREADY_ON_TASK,
} from '@/lib/error-codes';
import { sanitizeString, checkMaxLength, checkIsBoolean, sanitizeRichText } from '@/lib/validation';
import {
    resolveSpacePermission,
    getSpaceIdForList,
    getSpaceIdForTask,
    blockCreateForPermission,
    blockWriteForPermission,
} from '@/lib/permissions/space-permissions';
import { addTagToTask } from '@/actions/tag-actions';

/**
 * Deepest relative depth in a subtree snapshot (0 = root with no children).
 *
 * @param {object} node - Snapshot node with an optional children array
 * @returns {number} Deepest relative depth in this subtree
 */
function snapshotMaxRelativeDepth(node) {
    const children = node.children || [];
    if (children.length === 0) return 0;
    return 1 + Math.max(...children.map(snapshotMaxRelativeDepth));
}

/**
 * Rejects adding a new direct subtask under parentId if its space has a cap and it's already reached.
 *
 * @param {object} supabase - Request-scoped Supabase client
 * @param {string} parentId - Task that would receive a new direct child
 * @returns {Promise<{ error: string, code: string }|null>} A refusal, or null to proceed
 * @throws {Error} Generic SERVER_LOAD_FAILED error when a read fails
 */
async function blockIfSubtaskCapReached(supabase, parentId) {
    const spaceId = await getSpaceIdForTask(supabase, parentId);
    if (!spaceId) return { error: 'Parent task not found', code: TASK_NOT_FOUND };

    const spaceResult = await supabase
        .from('spaces')
        .select('max_subtasks_per_parent')
        .eq('id', spaceId)
        .maybeSingle();
    throwIfQueryFailed('[tasks] subtask cap', spaceResult);
    const maxSubtasksPerParent = spaceResult.data?.max_subtasks_per_parent;
    if (!maxSubtasksPerParent) return null;

    const countResult = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('parent_id', parentId);
    throwIfQueryFailed('[tasks] subtask cap', countResult);

    if ((countResult.count ?? 0) >= maxSubtasksPerParent) {
        return {
            error: `This task already has the maximum of ${maxSubtasksPerParent} subtasks`,
            code: TASK_SUBTASK_CAP_REACHED,
        };
    }
    return null;
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
    async (user, supabase, fields) => {
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

        const title = sanitizeString(fields.title, true);
        const description = sanitizeRichText(fields.description);

        if (!title) {
            return { data: null, error: 'Title is required' };
        }

        const titleError = checkMaxLength(title, 200, 'Title');
        if (titleError) return { data: null, error: titleError.error };

        if (description) {
            const descriptionError = checkMaxLength(description, 10000, 'Description');
            if (descriptionError) return { data: null, error: descriptionError.error };
        }

        if (!fields.list_id) {
            return { data: null, error: 'A list is required' };
        }
        if (fields.sublist_id && fields.parent_id) {
            return { data: null, error: "A subtask can't belong to a sublist directly" };
        }

        const spaceId = await getSpaceIdForList(supabase, fields.list_id);
        const permissionLevel = await resolveSpacePermission(supabase, spaceId, user.id);
        const permissionBlock = blockCreateForPermission(permissionLevel);
        if (permissionBlock) return { data: null, ...permissionBlock };

        const { data: space } = await supabase
            .from('spaces')
            .select('require_due_date')
            .eq('id', spaceId)
            .maybeSingle();
        if (space?.require_due_date && !fields.due_date) {
            return {
                data: null,
                error: 'This space requires a due date on every task',
                code: TASK_DUE_DATE_REQUIRED,
            };
        }

        if (fields.is_prioritised !== undefined) {
            const priorityError = checkIsBoolean(
                fields.is_prioritised,
                'Priority',
                TASK_INVALID_PRIORITY,
            );
            if (priorityError) return { data: null, ...priorityError };
        }

        if (fields.parent_id) {
            const capBlock = await blockIfSubtaskCapReached(supabase, fields.parent_id);
            if (capBlock) return { data: null, ...capBlock };
        }

        if (fields.sublist_id) {
            const { data: sublist } = await supabase
                .from('sublists')
                .select('list_id')
                .eq('id', fields.sublist_id)
                .single();
            if (!sublist || sublist.list_id !== fields.list_id) {
                return { data: null, error: 'Sublist does not belong to this list' };
            }
        }

        let depth = 0;
        if (fields.parent_id) {
            const { data: parent } = await supabase
                .from('tasks')
                .select('depth')
                .eq('id', fields.parent_id)
                .single();
            if (parent) depth = parent.depth + 1;
        }

        // MAX_DEPTH_CONSTANT
        const nestingMode = await getNestingMode();
        if (!isDepthAllowed(depth, nestingMode)) {
            return { data: null, error: 'Maximum nesting depth reached' };
        }

        let position = fields.position;
        if (position === undefined || position === null) {
            const filters = fields.parent_id
                ? { parent_id: fields.parent_id }
                : {
                      list_id: fields.list_id,
                      parent_id: null,
                      sublist_id: fields.sublist_id ?? null,
                  };
            position = await getNextPosition(supabase, 'tasks', filters, 1);
        }

        let next_occurrence = null;
        if (fields.is_recurring && fields.recurrence_rule) {
            const nextDate = computeNextOccurrence(fields.recurrence_rule);
            next_occurrence = nextDate ? nextDate.toISOString() : null;
        }

        const { data: createdTask, error } = await insertRowOnce(
            supabase,
            'tasks',
            {
                title,
                description: description || null,
                status_id: fields.status_id ?? null,
                parent_id: fields.parent_id ?? null,
                sublist_id: fields.parent_id ? null : (fields.sublist_id ?? null),
                list_id: fields.list_id,
                position,
                depth,
                due_date: fields.due_date || null,
                is_prioritised: fields.is_prioritised ?? false,
                is_recurring: fields.is_recurring ?? false,
                recurrence_rule: fields.recurrence_rule ?? null,
                next_occurrence,
                created_by: user.id,
            },
            { clientId: clientId.id, ownerColumn: 'created_by', userId: user.id },
        );

        if (error) {
            console.error('[tasks] create failed', {
                listId: fields.list_id,
                code: error.code,
                detail: error.message,
            });
            const guestLimitResult = toGuestLimitResult(error);
            if (guestLimitResult) return { data: null, ...guestLimitResult };
            const rateLimitResult = toTaskRateLimitResult(error);
            if (rateLimitResult) return { data: null, ...rateLimitResult };
            return { data: null, error: 'Failed to create task' };
        }

        return { data: createdTask, error: null };
    },
);

/**
 * Creates a task and attaches any staged tag names to it in the same round trip.
 *
 * A failed tag attach never rolls back the task - the failure is reported in `tagErrors` instead.
 *
 * @param {object} fields - Same fields as `createTask`, plus:
 * @param {string[]} [fields.tagNames] - Tag names to attach after the task is created
 * @returns {{ data: object|null, error: string|null, tagErrors: string[] }}
 */
export async function createTaskWithTags({ tagNames, ...taskFields }) {
    const taskResult = await createTask(taskFields);
    if (taskResult.error || !taskResult.data) return { ...taskResult, tagErrors: [] };

    const tagErrors = [];
    for (const name of tagNames ?? []) {
        const tagResult = await addTagToTask({ taskId: taskResult.data.id, name });
        // A retried create finds its tags already attached, which is the result we want, not a failure
        if (tagResult.error && tagResult.code !== TAG_ALREADY_ON_TASK) {
            tagErrors.push(`${name}: ${tagResult.error}`);
        }
    }

    return { data: taskResult.data, error: null, tagErrors };
}

/**
 * Updates specific fields on an existing task.
 *
 * @param {string} taskId - Task ID to update
 * @param {object} fields - Partial task fields to update
 * @returns {{ data: object|null, error: string|null, code: string|undefined }}
 */
export const updateTask = withAuthenticatedAction(
    '[tasks] update',
    'Unexpected error updating task',
    async (user, supabase, taskId, fields) => {
        if (!taskId) return { data: null, error: 'Task ID is required' };

        const { data: existingTask } = await supabase
            .from('tasks')
            .select(
                'created_by, is_recurring, recurrence_rule, recurrence_spawned_count, lists(space_id, spaces(require_due_date))',
            )
            .eq('id', taskId)
            .maybeSingle();
        if (!existingTask) return { data: null, error: 'Task not found' };

        const permissionLevel = await resolveSpacePermission(
            supabase,
            existingTask.lists?.space_id,
            user.id,
        );
        const permissionBlock = blockWriteForPermission(permissionLevel, {
            isOwnRow: existingTask.created_by === user.id,
        });
        if (permissionBlock) return { data: null, ...permissionBlock };

        if (fields.due_date === null && existingTask.lists?.spaces?.require_due_date) {
            return {
                data: null,
                error: 'This space requires a due date on every task',
                code: TASK_DUE_DATE_REQUIRED,
            };
        }

        // Explicit allowlist, not { ...fields } - an unlisted field must never reach the update.
        const {
            title,
            description,
            status_id,
            due_date,
            sublist_id,
            is_prioritised,
            is_recurring,
            recurrence_rule,
        } = fields;
        const updates = {
            ...(title !== undefined && { title }),
            ...(description !== undefined && { description }),
            ...(status_id !== undefined && { status_id }),
            ...(due_date !== undefined && { due_date }),
            ...(sublist_id !== undefined && { sublist_id }),
            ...(is_prioritised !== undefined && { is_prioritised }),
            ...(is_recurring !== undefined && { is_recurring }),
            ...(recurrence_rule !== undefined && { recurrence_rule }),
        };

        if ('title' in updates) {
            updates.title = sanitizeString(updates.title, true);
            if (!updates.title) return { data: null, error: 'Title is required' };
            const titleError = checkMaxLength(updates.title, 200, 'Title');
            if (titleError) return { data: null, error: titleError.error };
        }

        if ('is_prioritised' in updates) {
            const priorityError = checkIsBoolean(
                updates.is_prioritised,
                'Priority',
                TASK_INVALID_PRIORITY,
            );
            if (priorityError) return { data: null, ...priorityError };
        }

        if ('description' in updates) {
            updates.description = sanitizeRichText(updates.description) || null;
            if (updates.description) {
                const descriptionError = checkMaxLength(updates.description, 10000, 'Description');
                if (descriptionError) return { data: null, error: descriptionError.error };
            }
        }

        if (updates.status_id) {
            // Look up the target status's own code rather than resolving a "the done status"
            // globally - statuses are per-space now, so there's no single done status id to compare against.
            const { data: targetStatus } = await supabase
                .from('statuses')
                .select('code')
                .eq('id', updates.status_id)
                .single();
            if (targetStatus?.code === 'done') {
                const canComplete = await canMarkTaskDone(supabase, taskId, updates.status_id);
                if (!canComplete) {
                    return {
                        data: null,
                        error: 'Complete all subtasks before marking this task done',
                    };
                }
            }
        }

        if ('sublist_id' in updates && updates.sublist_id) {
            const { data: existingTask } = await supabase
                .from('tasks')
                .select('parent_id, list_id')
                .eq('id', taskId)
                .single();
            if (existingTask?.parent_id) {
                return { data: null, error: "A subtask can't belong to a sublist directly" };
            }
            const { data: sublist } = await supabase
                .from('sublists')
                .select('list_id')
                .eq('id', updates.sublist_id)
                .single();
            if (!sublist || sublist.list_id !== existingTask?.list_id) {
                return { data: null, error: 'Sublist does not belong to this list' };
            }
        }

        if (updates.is_recurring && updates.recurrence_rule) {
            // A new or edited schedule starts its count again; an unrelated edit must not extend a limited series
            const isNewSchedule =
                !existingTask.is_recurring ||
                !recurrenceRulesMatch(existingTask.recurrence_rule, updates.recurrence_rule);
            if (isNewSchedule) updates.recurrence_spawned_count = 0;

            const nextDate = computeNextOccurrence(
                updates.recurrence_rule,
                updates.recurrence_spawned_count ?? existingTask.recurrence_spawned_count ?? 0,
            );
            updates.next_occurrence = nextDate ? nextDate.toISOString() : null;
        } else if (updates.is_recurring === false) {
            updates.next_occurrence = null;
        }

        const { data: updatedTask, error } = await supabase
            .from('tasks')
            .update(updates)
            .eq('id', taskId)
            .select()
            .maybeSingle();

        if (error || !updatedTask) {
            console.error('[tasks] update failed', {
                taskId,
                fields: Object.keys(updates),
                code: error?.code,
                detail: error?.message,
            });
            const rateLimitResult = toTaskRateLimitResult(error);
            if (rateLimitResult) return { data: null, ...rateLimitResult };
            return { data: null, error: 'Failed to update task' };
        }

        return { data: updatedTask, error: null };
    },
);

/**
 * Marks a task and all its descendants (any depth) as done in one update. Used when
 * completing a parent that still has incomplete subtasks - the user has already
 * confirmed the cascade via a UI dialog before this is called.
 *
 * @param {string} taskId - Root task to complete along with its descendants
 * @returns {{ error: string|null }}
 */
export const completeTaskAndDescendants = withAuthenticatedAction(
    '[tasks] complete-cascade',
    'Unexpected error completing tasks',
    async (user, supabase, taskId) => {
        if (!taskId) return { error: 'Task ID is required' };

        const { task, listTasks } = await getTaskListTree(supabase, taskId);
        if (!task) return { error: 'Task not found' };

        // Gated on root-task ownership only - RLS still blocks any descendant the caller doesn't own.
        const permissionLevel = await resolveSpacePermission(supabase, task.space_id, user.id);
        const permissionBlock = blockWriteForPermission(permissionLevel, {
            isOwnRow: task.created_by === user.id,
        });
        if (permissionBlock) return permissionBlock;

        const doneStatusId = await getDoneStatusId(supabase, task.space_id);
        if (!doneStatusId) return { error: 'No "done" status configured' };

        const descendantIds = Array.from(findDescendantIds(taskId, listTasks));
        const idsToComplete = [taskId, ...descendantIds];

        const { data: updatedRows, error } = await supabase
            .from('tasks')
            .update({ status_id: doneStatusId })
            .in('id', idsToComplete)
            .select('id');

        if (error) {
            console.error('[tasks] complete-cascade failed', {
                taskId,
                code: error.code,
                detail: error.message,
            });
            return toTaskRateLimitResult(error) ?? { error: 'Failed to mark tasks complete' };
        }

        const completedCount = updatedRows?.length ?? 0;
        if (completedCount < idsToComplete.length) {
            return { error: null, completedCount, totalCount: idsToComplete.length };
        }
        return { error: null };
    },
    { hasData: false },
);

/**
 * Marks a task and all its descendants as the default (not-done) status in one update.
 * Assumes the cascade-confirm dialog already ran - this just performs the write.
 *
 * @param {string} taskId - Root task to uncomplete along with its descendants
 * @returns {{ error: string|null }}
 */
export const uncompleteTaskAndDescendants = withAuthenticatedAction(
    '[tasks] uncomplete-cascade',
    'Unexpected error uncompleting tasks',
    async (user, supabase, taskId) => {
        if (!taskId) return { error: 'Task ID is required' };

        const { task, listTasks } = await getTaskListTree(supabase, taskId);
        if (!task) return { error: 'Task not found' };

        // Gated on root-task ownership only - RLS still blocks any descendant the caller doesn't own.
        const permissionLevel = await resolveSpacePermission(supabase, task.space_id, user.id);
        const permissionBlock = blockWriteForPermission(permissionLevel, {
            isOwnRow: task.created_by === user.id,
        });
        if (permissionBlock) return permissionBlock;

        const defaultStatusId = await getDefaultStatusId(supabase, task.space_id);
        if (!defaultStatusId) return { error: 'No default status configured' };

        const descendantIds = Array.from(findDescendantIds(taskId, listTasks));
        const idsToUncomplete = [taskId, ...descendantIds];

        const { data: updatedRows, error } = await supabase
            .from('tasks')
            .update({ status_id: defaultStatusId })
            .in('id', idsToUncomplete)
            .select('id');

        if (error) {
            console.error('[tasks] uncomplete-cascade failed', {
                taskId,
                code: error.code,
                detail: error.message,
            });
            return toTaskRateLimitResult(error) ?? { error: 'Failed to mark tasks incomplete' };
        }

        const uncompletedCount = updatedRows?.length ?? 0;
        if (uncompletedCount < idsToUncomplete.length) {
            return {
                error: null,
                completedCount: uncompletedCount,
                totalCount: idsToUncomplete.length,
            };
        }
        return { error: null };
    },
    { hasData: false },
);

/**
 * Deletes a task by ID. Cascades to children via the database ON DELETE CASCADE constraint.
 *
 * @param {string} id - Task ID to delete
 * @returns {{ error: string|null }}
 */
export const deleteTask = withAuthenticatedAction(
    '[tasks] delete',
    'Unexpected error deleting task',
    async (user, supabase, id) => {
        if (!id) return { error: 'Task ID is required' };

        const { data: existingTask } = await supabase
            .from('tasks')
            .select('created_by, lists(space_id)')
            .eq('id', id)
            .maybeSingle();
        if (!existingTask) return { error: 'Task not found' };

        const permissionLevel = await resolveSpacePermission(
            supabase,
            existingTask.lists?.space_id,
            user.id,
        );
        const permissionBlock = blockWriteForPermission(permissionLevel, {
            isOwnRow: existingTask.created_by === user.id,
        });
        if (permissionBlock) return permissionBlock;

        const { data: deletedTask, error } = await supabase
            .from('tasks')
            .delete()
            .eq('id', id)
            .select()
            .maybeSingle();

        if (error || !deletedTask) {
            return toTaskRateLimitResult(error) ?? { error: 'Task not found' };
        }

        return { error: null };
    },
    { hasData: false },
);

/**
 * Deletes a task and re-parents its direct children to the deleted task's parent, in one database transaction.
 * Children take the gap where the deleted task sat; deeper descendants stay attached to their own parents.
 *
 * @param {string} taskId - ID of the task to delete
 * @returns {{ error: string|null }}
 */
export const deleteTaskAndReparentChildren = withAuthenticatedAction(
    '[tasks] reparent-delete',
    'Unexpected error during reparent-delete',
    async (user, supabase, taskId) => {
        if (!taskId) return { error: 'Task ID is required' };

        const { data: task, error: taskError } = await supabase
            .from('tasks')
            .select('created_by, lists(space_id)')
            .eq('id', taskId)
            .single();

        if (taskError || !task) return { error: 'Task not found' };

        const permissionLevel = await resolveSpacePermission(
            supabase,
            task.lists?.space_id,
            user.id,
        );
        const permissionBlock = blockWriteForPermission(permissionLevel, {
            isOwnRow: task.created_by === user.id,
        });
        if (permissionBlock) return permissionBlock;

        // One transaction: children are moved up and the task deleted together, so a failure changes nothing.
        const { error: reparentDeleteError } = await supabase.rpc('delete_task_reparent_children', {
            p_task_id: taskId,
        });
        if (reparentDeleteError) return toReparentDeleteFailure(taskId, reparentDeleteError);

        return { error: null };
    },
    { hasData: false },
);

/**
 * Maps a delete_task_reparent_children database error to a stable code; unrecognised errors are logged.
 *
 * @param {string} taskId - Task whose delete failed, for the log line
 * @param {{ code?: string, message?: string }} reparentDeleteError - Error returned by the rpc call
 * @returns {{ error: string, code: string }} User-safe message and stable code
 */
function toReparentDeleteFailure(taskId, reparentDeleteError) {
    const rateLimitResult = toTaskRateLimitResult(reparentDeleteError);
    if (rateLimitResult) return rateLimitResult;
    if (reparentDeleteError.message?.includes('TASK_NOT_FOUND')) {
        return { error: 'Task not found', code: TASK_NOT_FOUND };
    }
    if (reparentDeleteError.message?.includes(TASK_SUBTASK_CAP_REACHED)) {
        return {
            error: 'Deleting this task would give its parent more subtasks than this space allows',
            code: TASK_SUBTASK_CAP_REACHED,
        };
    }
    if (reparentDeleteError.message?.includes(TASK_REPARENT_FORBIDDEN_CHILDREN)) {
        return {
            error: "You can't delete this task while keeping subtasks you aren't allowed to edit",
            code: TASK_REPARENT_FORBIDDEN_CHILDREN,
        };
    }
    console.error('[tasks] reparent-delete failed', { taskId, dbCode: reparentDeleteError.code });
    return { error: 'Failed to delete task', code: TASK_REPARENT_DELETE_FAILED };
}

/**
 * Duplicates a task and its whole subtree, inserting the copy as the next
 * sibling right after the original. Generates new UUIDs for every node so
 * the duplicate is fully independent. Appends ' (copy)' to the root title.
 *
 * Not built on withAuthenticatedAction - its catch also runs toGuestLimitResult on the thrown error.
 *
 * @param {string} taskId - Task to duplicate
 * @param {string} [newRootId] - Optional client-made UUID for the copy; a retry with it finds the first try's copy
 * @returns {{ error: string|null, code: string|undefined }}
 */
export async function duplicateTask(taskId, newRootId) {
    const user = await getCurrentUser();
    if (!user) return { error: 'You must be logged in', code: NOT_AUTHENTICATED };

    if (!taskId) return { error: 'Task ID is required' };

    const clientId = readClientId({ id: newRootId });
    if (clientId.failure) return clientId.failure;

    try {
        const supabase = await createClient();

        // A retry finds the copy the first try made, before any trigger or limit can refuse the repeat
        if (await findOwnRowById(supabase, 'tasks', clientId.id, 'created_by', user.id)) {
            return { error: null };
        }

        const { data: task, error: taskError } = await supabase
            .from('tasks')
            .select('*, lists(space_id)')
            .eq('id', taskId)
            .single();
        if (taskError || !task) return { error: 'Task not found' };

        // Duplicating creates new rows, so this is a create-permission check, not row ownership.
        const permissionLevel = await resolveSpacePermission(
            supabase,
            task.lists?.space_id,
            user.id,
        );
        const permissionBlock = blockCreateForPermission(permissionLevel);
        if (permissionBlock) return permissionBlock;

        // Depth check needs only ids and parents; paged so a list past 1000 rows is not cut short.
        const { data: listTaskLinks, error: listTaskLinksError } = await fetchAllRows(
            ({ from, to }) =>
                supabase
                    .from('tasks')
                    .select('id, parent_id')
                    .eq('list_id', task.list_id)
                    .order('id', { ascending: true })
                    .range(from, to),
        );
        if (listTaskLinksError) {
            console.error('[duplicateTask] subtree read failed', {
                taskId,
                code: listTaskLinksError.code,
                detail: listTaskLinksError.message,
            });
            return { error: 'Failed to duplicate task' };
        }

        const snapshot = deepCloneSubtree(taskId, listTaskLinks);
        if (!snapshot) return { error: 'Task not found' };

        // MAX_DEPTH_CONSTANT - duplicate lands at the same depth as the original, but a deep
        // subtree could still push its descendants past the limit.
        const nestingMode = await getNestingMode();
        if (
            nestingMode === 'finite' &&
            task.depth + snapshotMaxRelativeDepth(snapshot) > FINITE_MAX_DEPTH
        ) {
            return { error: 'Duplicating this task would exceed the maximum nesting depth' };
        }

        if (task.parent_id) {
            const capBlock = await blockIfSubtaskCapReached(supabase, task.parent_id);
            if (capBlock) return capBlock;
        }

        let siblingsQuery = supabase
            .from('tasks')
            .select('id, position')
            .eq('list_id', task.list_id)
            .neq('id', taskId)
            .order('position', { ascending: true });
        siblingsQuery = task.parent_id
            ? siblingsQuery.eq('parent_id', task.parent_id)
            : siblingsQuery.is('parent_id', null);
        if (!task.parent_id) {
            siblingsQuery = task.sublist_id
                ? siblingsQuery.eq('sublist_id', task.sublist_id)
                : siblingsQuery.is('sublist_id', null);
        }

        const { data: siblings = [] } = await siblingsQuery;
        const nextSibling = siblings.find((sibling) => sibling.position > task.position);
        const newPosition = getPositionBetween(task.position, nextSibling?.position ?? null);

        // One transaction and one INSERT, so a failure never leaves a half-copied subtree.
        const { error: duplicateError } = await supabase.rpc('duplicate_task_subtree', {
            p_task_id: taskId,
            p_new_root_position: newPosition,
            ...(clientId.id && { p_new_root_id: clientId.id }),
        });
        if (duplicateError) {
            // Two requests with the same id at once: the loser's copy already exists, which is the result wanted
            const isOwnCopy =
                isUniqueViolation(duplicateError) &&
                (await findOwnRowById(supabase, 'tasks', clientId.id, 'created_by', user.id));
            if (isOwnCopy) return { error: null };
            return toDuplicateTaskFailure(taskId, duplicateError);
        }

        return { error: null };
    } catch (thrown) {
        console.error('[tasks] duplicate threw', { taskId, detail: thrown?.message });
        return { error: 'Failed to duplicate task', code: TASK_DUPLICATE_FAILED };
    }
}

/**
 * Maps a duplicate_task_subtree database error to a stable code; anything unrecognised is logged and kept generic.
 *
 * @param {string} taskId - Task whose duplication failed, for the log line
 * @param {{ code?: string, message?: string }} duplicateError - Error returned by the rpc call
 * @returns {{ error: string, code: string }} User-safe message and stable code
 */
function toDuplicateTaskFailure(taskId, duplicateError) {
    const guestLimitResult = toGuestLimitResult(duplicateError);
    if (guestLimitResult) return guestLimitResult;
    const rateLimitResult = toTaskRateLimitResult(duplicateError);
    if (rateLimitResult) return rateLimitResult;
    if (duplicateError.message?.includes('TASK_NOT_FOUND')) {
        return { error: 'Task not found', code: TASK_NOT_FOUND };
    }
    console.error('[tasks] duplicate failed', { taskId, dbCode: duplicateError.code });
    return { error: 'Failed to duplicate task', code: TASK_DUPLICATE_FAILED };
}

/**
 * Moves a task to a new parent, list, and/or sibling position, recomputing depth for it and every descendant.
 *
 * @param {string} taskId - Task to move
 * @param {object} fields
 * @param {string|null} [fields.newParentId] - New parent task, or null/omitted to move to root
 * @param {string|null} [fields.afterSiblingId] - Sibling to insert after, or null to append
 * @param {boolean} [fields.shouldPrependToStart] - Insert as the first sibling instead
 * @param {string} [fields.listId] - Target list, defaults to the task's current list
 * @param {string|null} [fields.sublistId] - Target sublist for a root-level move
 * @returns {{ data: object|null, error: string|null, code?: string }}
 */
export const moveTask = withAuthenticatedAction(
    '[tasks] move',
    'Unexpected error moving task',
    async (user, supabase, taskId, fields) => {
        const { newParentId, afterSiblingId, shouldPrependToStart, listId, sublistId } = fields;

        const { data: task, error: taskError } = await supabase
            .from('tasks')
            .select('*, lists(space_id)')
            .eq('id', taskId)
            .single();

        if (taskError || !task) return { data: null, error: 'Task not found' };

        const permissionLevel = await resolveSpacePermission(
            supabase,
            task.lists?.space_id,
            user.id,
        );
        const permissionBlock = blockWriteForPermission(permissionLevel, {
            isOwnRow: task.created_by === user.id,
        });
        if (permissionBlock) return { data: null, ...permissionBlock };

        // Read at most once, and only if a check below needs the whole list
        let listTaskLinksPromise;
        const loadListTaskLinks = () => {
            listTaskLinksPromise ??= fetchAllRows(({ from, to }) =>
                supabase
                    .from('tasks')
                    .select('id, parent_id, depth, sublist_id')
                    .eq('list_id', task.list_id)
                    .order('id', { ascending: true })
                    .range(from, to),
            ).then((listTaskLinksResult) => {
                throwIfQueryFailed('[tasks] move', listTaskLinksResult);
                return listTaskLinksResult.data;
            });
            return listTaskLinksPromise;
        };

        // Defense in depth - a self/descendant reparent creates a cycle that hangs every tree walker.
        if (newParentId === taskId) {
            return { data: null, error: 'A task cannot be its own parent' };
        }
        if (newParentId && wouldCreateCycle(taskId, newParentId, await loadListTaskLinks())) {
            return { data: null, error: 'Cannot move a task into its own descendant' };
        }

        if (newParentId && newParentId !== task.parent_id) {
            const capBlock = await blockIfSubtaskCapReached(supabase, newParentId);
            if (capBlock) return { data: null, ...capBlock };
        }

        const targetListId = listId ?? task.list_id;

        if (sublistId && newParentId) {
            return { data: null, error: "A subtask can't belong to a sublist directly" };
        }

        let newDepth = 0;
        if (newParentId) {
            const { data: newParent } = await supabase
                .from('tasks')
                .select('depth')
                .eq('id', newParentId)
                .single();
            if (newParent) newDepth = newParent.depth + 1;
        }

        const depthDelta = newDepth - task.depth;

        // Cap applies to the deepest descendant too - reparenting carries the whole subtree's shape.
        // MAX_DEPTH_CONSTANT
        const nestingMode = await getNestingMode();
        if (nestingMode === 'finite' && depthDelta > 0) {
            const depthExceeded = exceedsMaxDepthAfterMove({
                task,
                depthDelta,
                listTaskLinks: await loadListTaskLinks(),
                maxDepth: FINITE_MAX_DEPTH,
            });
            if (depthExceeded) {
                return { data: null, error: 'Move would exceed maximum nesting depth' };
            }
        }

        // Root sublist target: explicit sublistId, else the promoted task's original root ancestor's sublist.
        let resolvedSublistId = null;
        if (!newParentId) {
            if (sublistId !== undefined) {
                resolvedSublistId = sublistId ?? null;
            } else if (task.parent_id) {
                resolvedSublistId = resolveRootAncestorSublistId(taskId, await loadListTaskLinks());
            } else {
                resolvedSublistId = task.sublist_id ?? null;
            }

            if (resolvedSublistId) {
                const { data: sublist } = await supabase
                    .from('sublists')
                    .select('list_id')
                    .eq('id', resolvedSublistId)
                    .single();
                if (!sublist || sublist.list_id !== targetListId) {
                    return { data: null, error: 'Sublist does not belong to this list' };
                }
            }
        }

        let siblingsQuery;
        if (newParentId) {
            siblingsQuery = supabase
                .from('tasks')
                .select('id, position')
                .eq('parent_id', newParentId)
                .neq('id', taskId)
                .order('position', { ascending: true });
        } else {
            siblingsQuery = supabase
                .from('tasks')
                .select('id, position')
                .eq('list_id', targetListId)
                .is('parent_id', null)
                .neq('id', taskId)
                .order('position', { ascending: true });
            siblingsQuery = resolvedSublistId
                ? siblingsQuery.eq('sublist_id', resolvedSublistId)
                : siblingsQuery.is('sublist_id', null);
        }

        const { data: siblings } = await siblingsQuery;
        const newPosition = computeNewPosition(
            siblings || [],
            afterSiblingId,
            shouldPrependToStart,
        );

        // One transaction for the subtree and the task itself, so a failure can never leave a half-moved tree.
        const { data: movedTask, error: moveError } = await supabase
            .rpc('move_task_subtree', {
                p_task_id: taskId,
                p_new_parent_id: newParentId ?? null,
                p_new_sublist_id: newParentId ? null : resolvedSublistId,
                p_new_depth: newDepth,
                p_new_position: newPosition,
                p_new_list_id: targetListId,
            })
            .single();

        if (moveError) return { data: null, ...toMoveTaskFailure(taskId, moveError) };

        return { data: movedTask, error: null };
    },
);

/**
 * Maps a move_task_subtree database error to a stable code; anything unrecognised is logged and kept generic.
 *
 * @param {string} taskId - Task whose move failed, for the log line
 * @param {{ code?: string, message?: string }} moveError - Error returned by the rpc call
 * @returns {{ error: string, code: string }} User-safe message and stable code
 */
function toMoveTaskFailure(taskId, moveError) {
    const rateLimitResult = toTaskRateLimitResult(moveError);
    if (rateLimitResult) return rateLimitResult;
    if (moveError.message?.includes(TASK_MOVE_CYCLE)) {
        return { error: 'Cannot move a task into its own descendant', code: TASK_MOVE_CYCLE };
    }
    if (moveError.message?.includes(TASK_MOVE_FORBIDDEN_DESCENDANTS)) {
        return {
            error: "You can't move a task that contains subtasks you aren't allowed to edit",
            code: TASK_MOVE_FORBIDDEN_DESCENDANTS,
        };
    }
    console.error('[tasks] move failed', { taskId, dbCode: moveError.code });
    return { error: 'Failed to move task', code: TASK_MOVE_FAILED };
}

/**
 * Computes the new position for a task inserted among the given siblings, using fractional indexing.
 *
 * @param {{ id: string, position: number }[]} siblings - Sorted sibling list (excluding the moving task)
 * @param {string|null} afterSiblingId - ID of the sibling to insert after, or null to append at the end
 * @param {boolean} [shouldPrependToStart] - If true, insert as the new first sibling instead (overrides afterSiblingId)
 * @returns {number} New position value
 */
function computeNewPosition(siblings, afterSiblingId, shouldPrependToStart) {
    if (shouldPrependToStart) {
        const firstSibling = siblings[0];
        return getPositionBetween(null, firstSibling?.position ?? null);
    }

    if (!afterSiblingId) {
        const lastSibling = siblings[siblings.length - 1];
        return getPositionBetween(lastSibling?.position ?? null, null);
    }

    const afterSiblingIndex = siblings.findIndex((sibling) => sibling.id === afterSiblingId);
    if (afterSiblingIndex === -1) {
        const lastSibling = siblings[siblings.length - 1];
        return getPositionBetween(lastSibling?.position ?? null, null);
    }

    const beforePosition = siblings[afterSiblingIndex].position;
    const afterPosition = siblings[afterSiblingIndex + 1]?.position ?? null;
    return getPositionBetween(beforePosition, afterPosition);
}
