'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidateTag } from 'next/cache';
import { computeNextOccurrence } from '@/lib/recurrence';
import { getNestingMode, isDepthAllowed, FINITE_MAX_DEPTH } from '@/lib/config';
import { findDescendantIds, deepCloneSubtree } from '@/lib/tree';
import { getPositionBetween } from '@/lib/fractional-index';
import { getNextPosition } from '@/lib/position';
import { canMarkTaskDone, getDefaultStatusId, getDoneStatusId, getTaskListTree } from '@/lib/task-completion';

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
    if (!fields.title || fields.title.trim() === '') {
        return { data: null, error: 'Title is required' };
    }
    if (!fields.list_id) {
        return { data: null, error: 'A list is required' };
    }
    if (fields.sublist_id && fields.parent_id) {
        return { data: null, error: "A subtask can't belong to a sublist directly" };
    }

    try {
        const supabase = await createClient();

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
                : { list_id: fields.list_id, parent_id: null, sublist_id: fields.sublist_id ?? null };
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
                title: fields.title.trim(),
                description: fields.description ?? null,
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
            })
            .select()
            .single();

        if (error) {
            return { data: null, error: 'Failed to create task' };
        }

        revalidateTag('task-tree');
        return { data: createdTask, error: null };
    } catch {
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
    if (!taskId) return { data: null, error: 'Task ID is required' };

    try {
        const supabase = await createClient();

        const updates = { ...fields };

        if (updates.status_id) {
            const doneStatusId = await getDoneStatusId(supabase);
            if (doneStatusId && updates.status_id === doneStatusId) {
                const canComplete = await canMarkTaskDone(supabase, taskId, doneStatusId);
                if (!canComplete) {
                    return { data: null, error: 'Complete all subtasks before marking this task done' };
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
            .single();

        if (error) {
            return { data: null, error: 'Failed to update task' };
        }

        revalidateTag('task-tree');
        return { data: updatedTask, error: null };
    } catch {
        return { data: null, error: 'Unexpected error updating task' };
    }
}

/**
 * Marks a task and all its descendants (any depth) as done in one update. Used when
 * completing a parent that still has incomplete subtasks — the user has already
 * confirmed the cascade via a UI dialog before this is called.
 *
 * @param {string} taskId - Root task to complete along with its descendants
 * @returns {{ error: string|null }}
 */
export async function completeTaskAndDescendants(taskId) {
    if (!taskId) return { error: 'Task ID is required' };

    try {
        const supabase = await createClient();

        const { task, listTasks } = await getTaskListTree(supabase, taskId);
        if (!task) return { error: 'Task not found' };

        const doneStatusId = await getDoneStatusId(supabase);
        if (!doneStatusId) return { error: 'No "done" status configured' };

        const descendantIds = Array.from(findDescendantIds(taskId, listTasks));
        const idsToComplete = [taskId, ...descendantIds];

        const { error } = await supabase
            .from('tasks')
            .update({ status_id: doneStatusId })
            .in('id', idsToComplete);

        if (error) return { error: 'Failed to mark tasks complete' };

        revalidateTag('task-tree');
        return { error: null };
    } catch {
        return { error: 'Unexpected error completing tasks' };
    }
}

/**
 * Marks a task and all its descendants as the default (not-done) status in one update.
 * Assumes the cascade-confirm dialog already ran — this just performs the write.
 *
 * @param {string} taskId - Root task to uncomplete along with its descendants
 * @returns {{ error: string|null }}
 */
export async function uncompleteTaskAndDescendants(taskId) {
    if (!taskId) return { error: 'Task ID is required' };

    try {
        const supabase = await createClient();

        const { task, listTasks } = await getTaskListTree(supabase, taskId);
        if (!task) return { error: 'Task not found' };

        const defaultStatusId = await getDefaultStatusId(supabase);
        if (!defaultStatusId) return { error: 'No default status configured' };

        const descendantIds = Array.from(findDescendantIds(taskId, listTasks));
        const idsToUncomplete = [taskId, ...descendantIds];

        const { error } = await supabase
            .from('tasks')
            .update({ status_id: defaultStatusId })
            .in('id', idsToUncomplete);

        if (error) return { error: 'Failed to mark tasks incomplete' };

        revalidateTag('task-tree');
        return { error: null };
    } catch {
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
    if (!id) return { error: 'Task ID is required' };

    try {
        const supabase = await createClient();

        const { error } = await supabase.from('tasks').delete().eq('id', id);

        if (error) {
            return { error: 'Failed to delete task' };
        }

        revalidateTag('task-tree');
        return { error: null };
    } catch {
        return { error: 'Unexpected error deleting task' };
    }
}

/**
 * Deletes a task and re-parents its direct children to the deleted task's parent.
 * Children are spliced into the sibling list at the exact position where the deleted task sat.
 * Grandchildren (and deeper) remain attached to their own parents — only the top-level link is re-wired.
 *
 * Must re-parent BEFORE deleting to prevent the DB cascade from wiping the children first.
 *
 * @param {string} taskId - ID of the task to delete
 * @returns {{ error: string|null }}
 */
export async function deleteTaskAndReparentChildren(taskId) {
    if (!taskId) return { error: 'Task ID is required' };

    try {
        const supabase = await createClient();

        const { data: task, error: taskError } = await supabase
            .from('tasks')
            .select('id, parent_id, position, depth')
            .eq('id', taskId)
            .single();

        if (taskError || !task) return { error: 'Task not found' };

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
        const { error: deleteError } = await supabase.from('tasks').delete().eq('id', taskId);

        if (deleteError) return { error: 'Failed to delete task' };

        revalidateTag('task-tree');
        return { error: null };
    } catch {
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
    if (!taskId) return { error: 'Task ID is required' };

    try {
        const supabase = await createClient();

        const { data: task, error: taskError } = await supabase
            .from('tasks')
            .select('*')
            .eq('id', taskId)
            .single();
        if (taskError || !task) return { error: 'Task not found' };

        const { data: listTasks } = await supabase
            .from('tasks')
            .select('*')
            .eq('list_id', task.list_id);

        const snapshot = deepCloneSubtree(taskId, listTasks || []);
        if (!snapshot) return { error: 'Task not found' };

        // MAX_DEPTH_CONSTANT — duplicate lands at the same depth as the original, but a deep
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
            task.sublist_id,
            newPosition,
        );

        revalidateTag('task-tree');
        return { error: null };
    } catch {
        return { error: 'Failed to duplicate task' };
    }
}

/**
 * Recursively inserts a single snapshot node and its descendants.
 * Called by duplicateTask — not exported.
 *
 * @param {object} supabase - Supabase client
 * @param {object} node - Snapshot node with optional children array
 * @param {string|null} parentId - Parent ID for this insertion
 * @param {boolean} isRoot - Whether this is the root of the duplicated subtree
 * @param {string} listId - List the inserted copy belongs to
 * @param {string|null} [sublistId] - Sublist for the root node only; ignored for children
 * @param {number|null} [explicitPosition] - Exact position to use for the root node, if given
 */
async function insertSnapshotNode(
    supabase,
    node,
    parentId,
    isRoot,
    listId,
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
        sublist_id: parentId ? null : (isRoot ? (sublistId ?? null) : null),
        list_id: listId,
        position,
        depth,
        due_date: node.due_date ?? null,
        is_recurring: node.is_recurring ?? false,
        recurrence_rule: node.recurrence_rule ?? null,
        next_occurrence: node.next_occurrence ?? null,
    });

    if (error) throw new Error('Failed to insert node: ' + error.message);

    const children = node.children || [];
    for (const child of children) {
        await insertSnapshotNode(supabase, child, newId, false, listId);
    }
}
