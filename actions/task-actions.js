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
 * @param {string} [fields.description]
 * @param {string} [fields.status_id]
 * @param {string|null} [fields.parent_id]
 * @param {number} [fields.position]
 * @param {boolean} [fields.is_recurring]
 * @param {object} [fields.recurrence_rule]
 * @returns {{ data: object|null, error: string|null }}
 */
export async function createTask(fields) {
    if (!fields.title || fields.title.trim() === '') {
        return { data: null, error: 'Title is required' };
    }

    try {
        const supabase = await createClient();

        // Compute depth from parent
        let depth = 0;
        if (fields.parent_id) {
            const { data: parent } = await supabase
                .from('tasks')
                .select('depth')
                .eq('id', fields.parent_id)
                .single();
            if (parent) depth = parent.depth + 1;
        }

        // Compute position as last sibling + 1 if not provided
        let position = fields.position;
        if (position === undefined || position === null) {
            const query = supabase
                .from('tasks')
                .select('position')
                .order('position', { ascending: false })
                .limit(1);

            const siblingQuery = fields.parent_id
                ? query.eq('parent_id', fields.parent_id)
                : query.is('parent_id', null);

            const { data: siblings } = await siblingQuery;
            position = siblings && siblings.length > 0 ? siblings[0].position + 1 : 1;
        }

        // Compute next_occurrence if this is a recurring task
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
                position,
                depth,
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

        // Recompute next_occurrence when recurrence changes
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

        // 1. Fetch the task being deleted
        const { data: task, error: taskError } = await supabase
            .from('tasks')
            .select('id, parent_id, position, depth')
            .eq('id', taskId)
            .single();

        if (taskError || !task) return { error: 'Task not found' };

        // 2. Fetch its direct children ordered by position
        const { data: directChildren = [] } = await supabase
            .from('tasks')
            .select('id, position, depth')
            .eq('parent_id', taskId)
            .order('position', { ascending: true });

        // 3. Fetch all current siblings (same parent, excluding the task being deleted)
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

        // 4. Splice direct children into the sibling list at the deleted task's slot
        // Find the index in the ordered siblings where the deleted task would have sat
        const insertIndex = siblings.filter((s) => s.position < task.position).length;
        const newSiblingOrder = [
            ...siblings.slice(0, insertIndex),
            ...directChildren,
            ...siblings.slice(insertIndex),
        ];

        // 5. Re-number positions as 1, 2, 3, ... to avoid float precision issues
        const positionUpdates = newSiblingOrder.map((t, i) => ({ id: t.id, position: i + 1 }));

        // 6. Re-parent each direct child and decrement its descendants' depths
        for (const child of directChildren) {
            // Move child up one level (to the deleted task's parent, which may be null for root)
            await supabase
                .from('tasks')
                .update({ parent_id: task.parent_id, depth: task.depth })
                .eq('id', child.id);

            // Decrement depth for all of this child's descendants
            // The child moved from depth (task.depth + 1) to task.depth, so delta is -1
            const { data: descendants = [] } = await supabase
                .from('tasks')
                .select('id, depth')
                .eq('parent_id', child.id);

            // BFS to decrement every descendant's depth by 1
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

        // 7. Bulk-update positions for the merged sibling list
        for (const update of positionUpdates) {
            await supabase.from('tasks').update({ position: update.position }).eq('id', update.id);
        }

        // 8. Delete the task — cascade now only hits tasks that were already below the direct children
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
 * @returns {{ error: string|null }}
 */
export async function pasteTask(snapshot, parentId) {
    if (!snapshot) return { error: 'No snapshot to paste' };

    try {
        const supabase = await createClient();
        await insertSnapshotNode(supabase, snapshot, parentId, true);
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
 */
async function insertSnapshotNode(supabase, node, parentId, isRoot) {
    // Compute depth from parent
    let depth = 0;
    if (parentId) {
        const { data: parent } = await supabase
            .from('tasks')
            .select('depth')
            .eq('id', parentId)
            .single();
        if (parent) depth = parent.depth + 1;
    }

    // Append position after last sibling
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
        position,
        depth,
        is_recurring: node.is_recurring ?? false,
        recurrence_rule: node.recurrence_rule ?? null,
        next_occurrence: node.next_occurrence ?? null,
    });

    if (error) throw new Error('Failed to insert node: ' + error.message);

    // Recursively insert children
    const children = node.children || [];
    for (const child of children) {
        await insertSnapshotNode(supabase, child, newId, false);
    }
}
