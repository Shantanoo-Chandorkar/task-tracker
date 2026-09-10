import { createClient } from '@/lib/supabase/server';
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { getPositionBetween } from '@/lib/fractional-index';

/**
 * POST /api/tasks/[id]/move
 * Reparents a task to a new parent and repositions it after a specified sibling.
 * Recursively updates the depth of all descendants by the depth delta.
 * If listId differs from the task's current list, the task and every
 * descendant are moved to that list too (used for cross-list cut/paste).
 *
 * `afterSiblingId: null` means "append at the end" (used by promote/move-
 * to/paste). To insert as the new first sibling instead, pass
 * `shouldPrependToStart: true` — a plain `afterSiblingId: null` can't carry
 * that meaning since it's already taken.
 *
 * Body: { newParentId: uuid|null, afterSiblingId: uuid|null, shouldPrependToStart?: boolean, listId?: uuid }
 */
export async function POST(request, { params }) {
    const { id } = await params;

    try {
        const supabase = await createClient();
        const { newParentId, afterSiblingId, shouldPrependToStart, listId } = await request.json();

        const { data: task, error: taskError } = await supabase
            .from('tasks')
            .select('*')
            .eq('id', id)
            .single();

        if (taskError || !task) {
            return NextResponse.json({ error: 'Task not found' }, { status: 404 });
        }

        const targetListId = listId ?? task.list_id;
        const listChanged = targetListId !== task.list_id;

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

        if (depthDelta !== 0 || listChanged) {
            await updateDescendants(
                supabase,
                id,
                depthDelta,
                task.list_id,
                listChanged ? targetListId : null,
            );
        }

        const siblingsQuery = newParentId
            ? supabase
                  .from('tasks')
                  .select('id, position')
                  .eq('parent_id', newParentId)
                  .neq('id', id)
                  .order('position', { ascending: true })
            : supabase
                  .from('tasks')
                  .select('id, position')
                  .eq('list_id', targetListId)
                  .is('parent_id', null)
                  .neq('id', id)
                  .order('position', { ascending: true });

        const { data: siblings } = await siblingsQuery;
        const newPosition = computeNewPosition(
            siblings || [],
            afterSiblingId,
            shouldPrependToStart,
        );

        const { data: updated, error: updateError } = await supabase
            .from('tasks')
            .update({
                parent_id: newParentId ?? null,
                depth: newDepth,
                position: newPosition,
                list_id: targetListId,
            })
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            return NextResponse.json({ error: 'Failed to move task' }, { status: 500 });
        }

        revalidateTag('task-tree');
        return NextResponse.json(updated);
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * Fetches every task in the subtree's current list and recursively updates
 * each descendant's depth (by the given delta) and, if the subtree is
 * changing lists, its list_id too.
 *
 * @param {object} supabase - Supabase client
 * @param {string} taskId - Root of the subtree whose descendants need updating
 * @param {number} depthDelta - Amount to add to each descendant's current depth
 * @param {string} currentListId - List the subtree currently lives in, before the move
 * @param {string|null} newListId - List to move descendants into, or null if the list isn't changing
 */
async function updateDescendants(supabase, taskId, depthDelta, currentListId, newListId) {
    const { data: allTasks } = await supabase
        .from('tasks')
        .select('id, parent_id, depth')
        .eq('list_id', currentListId);
    if (!allTasks) return;

    const descendants = [];
    const queue = [taskId];

    while (queue.length > 0) {
        const currentId = queue.shift();
        const children = allTasks.filter((task) => task.parent_id === currentId);
        for (const child of children) {
            descendants.push(child);
            queue.push(child.id);
        }
    }

    // For v1 with typically shallow trees, individual updates are acceptable
    for (const descendant of descendants) {
        const updates = { depth: descendant.depth + depthDelta };
        if (newListId) updates.list_id = newListId;
        await supabase.from('tasks').update(updates).eq('id', descendant.id);
    }
}

/**
 * Computes the new position for a task being inserted after the given sibling.
 * Uses fractional indexing so existing positions don't need renumbering.
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
