'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidateTag } from 'next/cache';
import { computeNextOccurrence } from '@/lib/recurrence';

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

    try {
        const supabase = await createClient();

        let depth = 0;
        if (fields.parent_id) {
            const { data: parent } = await supabase
                .from('tasks')
                .select('depth')
                .eq('id', fields.parent_id)
                .single();
            if (parent) depth = parent.depth + 1;
        }

        let position = fields.position;
        if (position === undefined || position === null) {
            const query = supabase
                .from('tasks')
                .select('position')
                .order('position', { ascending: false })
                .limit(1);

            const siblingQuery = fields.parent_id
                ? query.eq('parent_id', fields.parent_id)
                : query.eq('list_id', fields.list_id).is('parent_id', null);

            const { data: siblings } = await siblingQuery;
            position = siblings && siblings.length > 0 ? siblings[0].position + 1 : 1;
        }

        let next_occurrence = null;
        if (fields.is_recurring && fields.recurrence_rule) {
            const nextDate = computeNextOccurrence(fields.recurrence_rule);
            next_occurrence = nextDate ? nextDate.toISOString() : null;
        }

        const { data, error } = await supabase
            .from('tasks')
            .insert({
                title: fields.title.trim(),
                description: fields.description ?? null,
                status_id: fields.status_id ?? null,
                parent_id: fields.parent_id ?? null,
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
        return { data, error: null };
    } catch {
        return { data: null, error: 'Unexpected error creating task' };
    }
}

/**
 * Updates specific fields on an existing task.
 *
 * @param {string} id - Task ID to update
 * @param {object} fields - Partial task fields to update
 * @returns {{ data: object|null, error: string|null }}
 */
export async function updateTask(id, fields) {
    if (!id) return { data: null, error: 'Task ID is required' };

    try {
        const supabase = await createClient();

        const updates = { ...fields };

        if (updates.is_recurring && updates.recurrence_rule) {
            const nextDate = computeNextOccurrence(updates.recurrence_rule);
            updates.next_occurrence = nextDate ? nextDate.toISOString() : null;
        } else if (updates.is_recurring === false) {
            updates.next_occurrence = null;
        }

        const { data, error } = await supabase
            .from('tasks')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return { data: null, error: 'Failed to update task' };
        }

        revalidateTag('task-tree');
        return { data, error: null };
    } catch {
        return { data: null, error: 'Unexpected error updating task' };
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
 * Recursively inserts a snapshot subtree under a new parent.
 * Generates new UUIDs for every node so the paste creates independent copies.
 * Appends ' (copy)' to the root task's title.
 *
 * @param {object} snapshot - Deep clone of the subtree from the clipboard
 * @param {string|null} parentId - Parent task ID to paste under, or null for root
 * @param {string} listId - List the pasted copy belongs to (the list currently being viewed)
 * @returns {{ error: string|null }}
 */
export async function pasteTask(snapshot, parentId, listId) {
    if (!snapshot) return { error: 'No snapshot to paste' };
    if (!listId) return { error: 'A list is required' };

    try {
        const supabase = await createClient();
        await insertSnapshotNode(supabase, snapshot, parentId, true, listId);
        revalidateTag('task-tree');
        return { error: null };
    } catch {
        return { error: 'Failed to paste task' };
    }
}

/**
 * Recursively inserts a single snapshot node and its descendants.
 * Called by pasteTask — not exported.
 *
 * @param {object} supabase - Supabase client
 * @param {object} node - Snapshot node with optional children array
 * @param {string|null} parentId - Parent ID for this insertion
 * @param {boolean} isRoot - Whether this is the root of the paste operation
 * @param {string} listId - List the inserted copy belongs to
 */
async function insertSnapshotNode(supabase, node, parentId, isRoot, listId) {
    let depth = 0;
    if (parentId) {
        const { data: parent } = await supabase
            .from('tasks')
            .select('depth')
            .eq('id', parentId)
            .single();
        if (parent) depth = parent.depth + 1;
    }

    const siblingQuery = parentId
        ? supabase
              .from('tasks')
              .select('position')
              .eq('parent_id', parentId)
              .order('position', { ascending: false })
              .limit(1)
        : supabase
              .from('tasks')
              .select('position')
              .eq('list_id', listId)
              .is('parent_id', null)
              .order('position', { ascending: false })
              .limit(1);

    const { data: siblings } = await siblingQuery;
    const position = siblings && siblings.length > 0 ? siblings[0].position + 1 : 1;

    const newId = crypto.randomUUID();
    const title = isRoot ? `${node.title} (copy)` : node.title;

    const { error } = await supabase.from('tasks').insert({
        id: newId,
        title,
        description: node.description ?? null,
        status_id: node.status_id ?? null,
        parent_id: parentId ?? null,
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
