'use server';

import { createClient } from '@/lib/supabase/server';
import { computeNextOccurrence } from '@/lib/recurrence';
import { getNestingMode, isDepthAllowed, FINITE_MAX_DEPTH } from '@/lib/config';
import { findDescendantIds, deepCloneSubtree } from '@/lib/tree';
import { getPositionBetween } from '@/lib/fractional-index';
import { getNextPosition } from '@/lib/position';
import {
    canMarkTaskDone,
    getDefaultStatusId,
    getDoneStatusId,
    getTaskListTree,
} from '@/lib/task-completion';
import { getCurrentUser } from '@/lib/auth/session';
import { toGuestLimitResult } from '@/lib/guest/guest-database-errors';
import { NOT_AUTHENTICATED, TASK_INVALID_PRIORITY } from '@/lib/error-codes';
import { sanitizeString, checkMaxLength, sanitizeRichText } from '@/lib/validation';
import {
    resolveSpacePermission,
    getSpaceIdForList,
    getSpaceIdForTask,
    blockCreateForPermission,
    blockWriteForPermission,
} from '@/lib/permissions/space-permissions';

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
 * Creates a new task. Computes depth from parent if provided.
 * Appends the task as the last sibling if no position is specified.
 *
 * @param {object} fields
 * @param {string} fields.title - Required task title
 * @param {string} fields.list_id - Required list this task belongs to
 * @param {string} [fields.description]
 * @param {string} [fields.status_id]
 * @param {string|null} [fields.parent_id]
 * @param {string|null} [fields.sublist_id] - Root tasks only; must belong to the same list
 * @param {number} [fields.position]
 * @param {string|null} [fields.due_date] - ISO date string (YYYY-MM-DD), or null
 * @param {boolean} [fields.is_recurring]
 * @param {object} [fields.recurrence_rule]
 * @returns {{ data: object|null, error: string|null }}
 */
export async function createTask(fields) {
    const user = await getCurrentUser();
    if (!user) return { data: null, error: 'You must be logged in', code: NOT_AUTHENTICATED };

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

    try {
        const supabase = await createClient();

        const spaceId = await getSpaceIdForList(supabase, fields.list_id);
        const permissionLevel = await resolveSpacePermission(supabase, spaceId, user.id);
        const permissionBlock = blockCreateForPermission(permissionLevel);
        if (permissionBlock) return { data: null, ...permissionBlock };

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

        const { data: createdTask, error } = await supabase
            .from('tasks')
            .insert({
                title,
                description: description || null,
                status_id: fields.status_id ?? null,
                parent_id: fields.parent_id ?? null,
                sublist_id: fields.parent_id ? null : (fields.sublist_id ?? null),
                list_id: fields.list_id,
                position,
                depth,
                due_date: fields.due_date || null,
                is_recurring: fields.is_recurring ?? false,
                recurrence_rule: fields.recurrence_rule ?? null,
                next_occurrence,
                created_by: user.id,
            })
            .select()
            .single();

        if (error) {
            console.error('[tasks] create failed', {
                listId: fields.list_id,
                code: error.code,
                detail: error.message,
            });
            const guestLimitResult = toGuestLimitResult(error);
            if (guestLimitResult) return { data: null, ...guestLimitResult };
            return { data: null, error: 'Failed to create task' };
        }

        return { data: createdTask, error: null };
    } catch (thrown) {
        console.error('[tasks] create threw', { listId: fields.list_id, detail: thrown?.message });
        return { data: null, error: 'Unexpected error creating task' };
    }
}

/**
 * Updates specific fields on an existing task.
 *
 * @param {string} taskId - Task ID to update
 * @param {object} fields - Partial task fields to update
 * @returns {{ data: object|null, error: string|null }}
 */
export async function updateTask(taskId, fields) {
    const user = await getCurrentUser();
    if (!user) return { data: null, error: 'You must be logged in', code: NOT_AUTHENTICATED };

    if (!taskId) return { data: null, error: 'Task ID is required' };

    try {
        const supabase = await createClient();

        const { data: existingTask } = await supabase
            .from('tasks')
            .select('created_by, lists(space_id)')
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

        if ('is_prioritised' in updates && typeof updates.is_prioritised !== 'boolean') {
            return {
                data: null,
                error: 'Priority must be true or false',
                code: TASK_INVALID_PRIORITY,
            };
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
            const nextDate = computeNextOccurrence(updates.recurrence_rule);
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
            return { data: null, error: 'Failed to update task' };
        }

        return { data: updatedTask, error: null };
    } catch (thrown) {
        console.error('[tasks] update threw', { taskId, detail: thrown?.message });
        return { data: null, error: 'Unexpected error updating task' };
    }
}

/**
 * Marks a task and all its descendants (any depth) as done in one update. Used when
 * completing a parent that still has incomplete subtasks - the user has already
 * confirmed the cascade via a UI dialog before this is called.
 *
 * @param {string} taskId - Root task to complete along with its descendants
 * @returns {{ error: string|null }}
 */
export async function completeTaskAndDescendants(taskId) {
    const user = await getCurrentUser();
    if (!user) return { error: 'You must be logged in', code: NOT_AUTHENTICATED };

    if (!taskId) return { error: 'Task ID is required' };

    try {
        const supabase = await createClient();

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
            return { error: 'Failed to mark tasks complete' };
        }

        const completedCount = updatedRows?.length ?? 0;
        if (completedCount < idsToComplete.length) {
            return { error: null, completedCount, totalCount: idsToComplete.length };
        }
        return { error: null };
    } catch (thrown) {
        console.error('[tasks] complete-cascade threw', { taskId, detail: thrown?.message });
        return { error: 'Unexpected error completing tasks' };
    }
}

/**
 * Marks a task and all its descendants as the default (not-done) status in one update.
 * Assumes the cascade-confirm dialog already ran - this just performs the write.
 *
 * @param {string} taskId - Root task to uncomplete along with its descendants
 * @returns {{ error: string|null }}
 */
export async function uncompleteTaskAndDescendants(taskId) {
    const user = await getCurrentUser();
    if (!user) return { error: 'You must be logged in', code: NOT_AUTHENTICATED };

    if (!taskId) return { error: 'Task ID is required' };

    try {
        const supabase = await createClient();

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
            return { error: 'Failed to mark tasks incomplete' };
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
    } catch (thrown) {
        console.error('[tasks] uncomplete-cascade threw', { taskId, detail: thrown?.message });
        return { error: 'Unexpected error uncompleting tasks' };
    }
}

/**
 * Deletes a task by ID. Cascades to children via the database ON DELETE CASCADE constraint.
 *
 * @param {string} id - Task ID to delete
 * @returns {{ error: string|null }}
 */
export async function deleteTask(id) {
    const user = await getCurrentUser();
    if (!user) return { error: 'You must be logged in', code: NOT_AUTHENTICATED };

    if (!id) return { error: 'Task ID is required' };

    try {
        const supabase = await createClient();

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
            return { error: 'Task not found' };
        }

        return { error: null };
    } catch (thrown) {
        console.error('[tasks] delete threw', { id, detail: thrown?.message });
        return { error: 'Unexpected error deleting task' };
    }
}

/**
 * Deletes a task and re-parents its direct children to the deleted task's parent.
 * Children are spliced into the sibling list at the exact position where the deleted task sat.
 * Grandchildren (and deeper) remain attached to their own parents - only the top-level link is re-wired.
 *
 * Must re-parent BEFORE deleting to prevent the DB cascade from wiping the children first.
 *
 * @param {string} taskId - ID of the task to delete
 * @returns {{ error: string|null }}
 */
export async function deleteTaskAndReparentChildren(taskId) {
    const user = await getCurrentUser();
    if (!user) return { error: 'You must be logged in', code: NOT_AUTHENTICATED };

    if (!taskId) return { error: 'Task ID is required' };

    try {
        const supabase = await createClient();

        const { data: task, error: taskError } = await supabase
            .from('tasks')
            .select('id, parent_id, position, depth, created_by, lists(space_id)')
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

        const { data: directChildren = [] } = await supabase
            .from('tasks')
            .select('id, position, depth')
            .eq('parent_id', taskId)
            .order('position', { ascending: true });

        const siblingsQuery = task.parent_id
            ? supabase
                  .from('tasks')
                  .select('id, position')
                  .eq('parent_id', task.parent_id)
                  .neq('id', taskId)
                  .order('position', { ascending: true })
            : supabase
                  .from('tasks')
                  .select('id, position')
                  .is('parent_id', null)
                  .neq('id', taskId)
                  .order('position', { ascending: true });

        const { data: siblings = [] } = await siblingsQuery;

        const insertIndex = siblings.filter((sibling) => sibling.position < task.position).length;
        const newSiblingOrder = [
            ...siblings.slice(0, insertIndex),
            ...directChildren,
            ...siblings.slice(insertIndex),
        ];

        // Whole-integer positions avoid accumulating float precision loss from fractional-index math
        const positionUpdates = newSiblingOrder.map((sibling, index) => ({
            id: sibling.id,
            position: index + 1,
        }));

        for (const child of directChildren) {
            // task.parent_id may be null here, which correctly re-roots the child at the top level
            await supabase
                .from('tasks')
                .update({ parent_id: task.parent_id, depth: task.depth })
                .eq('id', child.id);

            // Depth delta is -1: the child moved from depth (task.depth + 1) up to task.depth
            const { data: descendants = [] } = await supabase
                .from('tasks')
                .select('id, depth')
                .eq('parent_id', child.id);

            const queue = [...descendants];
            while (queue.length > 0) {
                const node = queue.shift();
                await supabase
                    .from('tasks')
                    .update({ depth: node.depth - 1 })
                    .eq('id', node.id);

                const { data: grandchildren = [] } = await supabase
                    .from('tasks')
                    .select('id, depth')
                    .eq('parent_id', node.id);

                queue.push(...grandchildren);
            }
        }

        for (const update of positionUpdates) {
            await supabase.from('tasks').update({ position: update.position }).eq('id', update.id);
        }

        // Cascade now only reaches tasks still below the direct children, already re-parented away above
        const { data: deletedTask, error: deleteError } = await supabase
            .from('tasks')
            .delete()
            .eq('id', taskId)
            .select()
            .maybeSingle();

        if (deleteError || !deletedTask) return { error: 'Task not found' };

        return { error: null };
    } catch (thrown) {
        console.error('[tasks] reparent-delete threw', { taskId, detail: thrown?.message });
        return { error: 'Unexpected error during reparent-delete' };
    }
}

/**
 * Duplicates a task and its whole subtree, inserting the copy as the next
 * sibling right after the original. Generates new UUIDs for every node so
 * the duplicate is fully independent. Appends ' (copy)' to the root title.
 *
 * @param {string} taskId - Task to duplicate
 * @returns {{ error: string|null }}
 */
export async function duplicateTask(taskId) {
    const user = await getCurrentUser();
    if (!user) return { error: 'You must be logged in', code: NOT_AUTHENTICATED };

    if (!taskId) return { error: 'Task ID is required' };

    try {
        const supabase = await createClient();

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

        const { data: listTasks } = await supabase
            .from('tasks')
            .select('*')
            .eq('list_id', task.list_id);

        const snapshot = deepCloneSubtree(taskId, listTasks || []);
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

        await insertSnapshotNode(
            supabase,
            snapshot,
            task.parent_id,
            true,
            task.list_id,
            user.id,
            task.sublist_id,
            newPosition,
        );

        return { error: null };
    } catch (thrown) {
        console.error('[tasks] duplicate threw', { taskId, detail: thrown?.message });
        const guestLimitResult = toGuestLimitResult(thrown);
        if (guestLimitResult) return guestLimitResult;
        return { error: 'Failed to duplicate task' };
    }
}

/**
 * Recursively inserts a single snapshot node and its descendants.
 * Called by duplicateTask - not exported.
 *
 * @param {object} supabase - Supabase client
 * @param {object} node - Snapshot node with optional children array
 * @param {string|null} parentId - Parent ID for this insertion
 * @param {boolean} isRoot - Whether this is the root of the duplicated subtree
 * @param {string} listId - List the inserted copy belongs to
 * @param {string} createdBy - User id to attribute every inserted node (root and descendants) to
 * @param {string|null} [sublistId] - Sublist for the root node only; ignored for children
 * @param {number|null} [explicitPosition] - Exact position to use for the root node, if given
 */
async function insertSnapshotNode(
    supabase,
    node,
    parentId,
    isRoot,
    listId,
    createdBy,
    sublistId = null,
    explicitPosition = null,
) {
    let depth = 0;
    if (parentId) {
        const { data: parent } = await supabase
            .from('tasks')
            .select('depth')
            .eq('id', parentId)
            .single();
        if (parent) depth = parent.depth + 1;
    }

    let position;
    if (isRoot && explicitPosition !== null) {
        position = explicitPosition;
    } else {
        const filters = parentId
            ? { parent_id: parentId }
            : { list_id: listId, parent_id: null, sublist_id: sublistId ?? null };
        position = await getNextPosition(supabase, 'tasks', filters, 1);
    }

    const newId = crypto.randomUUID();
    const title = isRoot ? `${node.title} (copy)` : node.title;

    const { error } = await supabase.from('tasks').insert({
        id: newId,
        title,
        description: node.description ?? null,
        status_id: node.status_id ?? null,
        parent_id: parentId ?? null,
        sublist_id: parentId ? null : isRoot ? (sublistId ?? null) : null,
        list_id: listId,
        position,
        depth,
        due_date: node.due_date ?? null,
        is_recurring: node.is_recurring ?? false,
        recurrence_rule: node.recurrence_rule ?? null,
        next_occurrence: node.next_occurrence ?? null,
        created_by: createdBy,
    });

    if (error) throw new Error('Failed to insert node: ' + error.message);

    const children = node.children || [];
    for (const child of children) {
        await insertSnapshotNode(supabase, child, newId, false, listId, createdBy);
    }
}
