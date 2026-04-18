import { createClient } from '@/lib/supabase/server';
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { getPositionBetween } from '@/lib/fractional-index';

/**
 * POST /api/tasks/[id]/move
 * Reparents a task to a new parent and repositions it after a specified sibling.
 * Recursively updates the depth of all descendants by the depth delta.
 *
 * Body: { newParentId: uuid|null, afterId: uuid|null }
 */
export async function POST(request, { params }) {
    const { id } = await params;

    try {
        const supabase = await createClient();
        const { newParentId, afterId } = await request.json();

        // Fetch the task being moved
        const { data: task, error: taskError } = await supabase
            .from('tasks')
            .select('*')
            .eq('id', id)
            .single();

        if (taskError || !task) {
            return NextResponse.json({ error: 'Task not found' }, { status: 404 });
        }

        // Compute new depth from the target parent
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

        // Update all descendants' depths if the task is moving to a different depth level
        if (depthDelta !== 0) {
            await updateDescendantDepths(supabase, id, depthDelta);
        }

        // Compute new position using fractional indexing
        // Get siblings at the target parent (excluding the task being moved)
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
                  .is('parent_id', null)
                  .neq('id', id)
                  .order('position', { ascending: true });

        const { data: siblings } = await siblingsQuery;
        const newPosition = computeNewPosition(siblings || [], afterId);

        // Update the task's parent, depth, and position
        const { data: updated, error: updateError } = await supabase
            .from('tasks')
            .update({
                parent_id: newParentId ?? null,
                depth: newDepth,
                position: newPosition,
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
 * Fetches all tasks and recursively updates the depth of every descendant
 * of the given task by the specified delta.
 *
 * @param {object} supabase - Supabase client
 * @param {string} taskId - Root of the subtree whose descendants need updating
 * @param {number} depthDelta - Amount to add to each descendant's current depth
 */
async function updateDescendantDepths(supabase, taskId, depthDelta) {
    const { data: allTasks } = await supabase.from('tasks').select('id, parent_id, depth');
    if (!allTasks) return;

    // BFS to collect all descendants
    const descendants = [];
    const queue = [taskId];

    while (queue.length > 0) {
        const currentId = queue.shift();
        const children = allTasks.filter((t) => t.parent_id === currentId);
        for (const child of children) {
            descendants.push(child);
            queue.push(child.id);
        }
    }

    // Update each descendant individually
    // For v1 with typically shallow trees, individual updates are acceptable
    for (const desc of descendants) {
        await supabase
            .from('tasks')
            .update({ depth: desc.depth + depthDelta })
            .eq('id', desc.id);
    }
}

/**
 * Computes the new position for a task being inserted after the given sibling.
 * Uses fractional indexing so existing positions don't need renumbering.
 *
 * @param {{ id: string, position: number }[]} siblings - Sorted sibling list (excluding the moving task)
 * @param {string|null} afterId - ID of the sibling to insert after, or null to prepend/append
 * @returns {number} New position value
 */
function computeNewPosition(siblings, afterId) {
    if (!afterId) {
        // No afterId: insert at the end
        const last = siblings[siblings.length - 1];
        return getPositionBetween(last?.position ?? null, null);
    }

    const afterIndex = siblings.findIndex((s) => s.id === afterId);
    if (afterIndex === -1) {
        // afterId not found in siblings: insert at the end
        const last = siblings[siblings.length - 1];
        return getPositionBetween(last?.position ?? null, null);
    }

    const a = siblings[afterIndex].position;
    const b = siblings[afterIndex + 1]?.position ?? null;
    return getPositionBetween(a, b);
}
