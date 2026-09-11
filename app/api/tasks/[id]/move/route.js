import { createClient } from '@/lib/supabase/server';
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { getPositionBetween } from '@/lib/fractional-index';
import { findAncestors, findDescendantIds } from '@/lib/tree';
import { getNestingMode, FINITE_MAX_DEPTH } from '@/lib/config';

/**
 * POST /api/tasks/[id]/move
 * Reparents a task and repositions it after a sibling; cascades depth (and list) to descendants.
 *
 * afterSiblingId: null means "append at the end"; shouldPrependToStart flags "insert at the start" instead.
 * sublistId only applies to root tasks (newParentId null); omitted on promote, it inherits the
 * task's original root ancestor's sublist.
 *
 * Body: { newParentId: uuid|null, afterSiblingId: uuid|null, shouldPrependToStart?: boolean,
 *   listId?: uuid, sublistId?: uuid|null }
 */
export async function POST(request, { params }) {
    const { id: taskId } = await params;

    try {
        const supabase = await createClient();
        const { newParentId, afterSiblingId, shouldPrependToStart, listId, sublistId } =
            await request.json();

        const { data: task, error: taskError } = await supabase
            .from('tasks')
            .select('*')
            .eq('id', taskId)
            .single();

        if (taskError || !task) {
            return NextResponse.json({ error: 'Task not found' }, { status: 404 });
        }

        // Defense in depth — a self/descendant reparent creates a cycle that hangs every tree walker.
        if (newParentId === taskId) {
            return NextResponse.json(
                { error: 'A task cannot be its own parent' },
                { status: 400 },
            );
        }
        if (newParentId) {
            const { data: allTasksInList } = await supabase
                .from('tasks')
                .select('id, parent_id')
                .eq('list_id', task.list_id);
            const descendantIds = findDescendantIds(taskId, allTasksInList || []);
            if (descendantIds.has(newParentId)) {
                return NextResponse.json(
                    { error: 'Cannot move a task into its own descendant' },
                    { status: 400 },
                );
            }
        }

        const targetListId = listId ?? task.list_id;
        const listChanged = targetListId !== task.list_id;

        if (sublistId && newParentId) {
            return NextResponse.json(
                { error: "A subtask can't belong to a sublist directly" },
                { status: 400 },
            );
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

        // Cap must hold for the deepest descendant of the moved subtree, not just the
        // moved task itself — reparenting a subtree carries its whole shape with it.
        // MAX_DEPTH_CONSTANT
        const nestingMode = await getNestingMode();
        if (nestingMode === 'finite' && depthDelta > 0) {
            const { data: allTasksForDepthCheck } = await supabase
                .from('tasks')
                .select('id, parent_id, depth')
                .eq('list_id', task.list_id);
            const descendantIds = findDescendantIds(taskId, allTasksForDepthCheck || []);
            const descendantDepths = [...descendantIds].map(
                (descendantId) =>
                    allTasksForDepthCheck.find((t) => t.id === descendantId)?.depth ?? task.depth,
            );
            const maxCurrentDepth = Math.max(task.depth, ...descendantDepths);
            if (maxCurrentDepth + depthDelta > FINITE_MAX_DEPTH) {
                return NextResponse.json(
                    { error: 'Move would exceed maximum nesting depth' },
                    { status: 400 },
                );
            }
        }

        if (depthDelta !== 0 || listChanged) {
            await updateDescendants(
                supabase,
                taskId,
                depthDelta,
                task.list_id,
                listChanged ? targetListId : null,
            );
        }

        // Root sublist target: explicit sublistId, else the promoted task's original root ancestor's sublist.
        let resolvedSublistId = null;
        if (!newParentId) {
            if (sublistId !== undefined) {
                resolvedSublistId = sublistId ?? null;
            } else if (task.parent_id) {
                const { data: allTasksInList } = await supabase
                    .from('tasks')
                    .select('id, parent_id, sublist_id')
                    .eq('list_id', task.list_id);
                const ancestors = findAncestors(taskId, allTasksInList || []);
                const rootAncestor = ancestors[ancestors.length - 1];
                resolvedSublistId = rootAncestor?.sublist_id ?? null;
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
                    return NextResponse.json(
                        { error: 'Sublist does not belong to this list' },
                        { status: 400 },
                    );
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

        const { data: updated, error: updateError } = await supabase
            .from('tasks')
            .update({
                parent_id: newParentId ?? null,
                sublist_id: newParentId ? null : resolvedSublistId,
                depth: newDepth,
                position: newPosition,
                list_id: targetListId,
            })
            .eq('id', taskId)
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
