import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { updateSublist, deleteSublist } from '@/actions/sublist-actions';
import { withApiErrorHandling, actionResponse, requireAuthResponse } from '@/lib/api-response';
import { countSublistTasks } from '@/lib/tree';

/**
 * GET /api/sublists/[id]
 * Returns the sublist plus a task_count that includes nested subtasks, not just root tasks.
 */
export const GET = withApiErrorHandling(async function GET(request, { params }) {
    const unauthorized = await requireAuthResponse();
    if (unauthorized) return unauthorized;

    const { id: sublistId } = await params;
    const supabase = await createClient();

    const { data: sublist, error } = await supabase
        .from('sublists')
        .select('*')
        .eq('id', sublistId)
        .single();

    if (error) {
        return NextResponse.json({ error: 'Sublist not found' }, { status: 404 });
    }

    const { data: listTasks, error: tasksError } = await supabase
        .from('tasks')
        .select('id, parent_id, sublist_id')
        .eq('list_id', sublist.list_id);

    if (tasksError) {
        throw tasksError;
    }

    const taskCount = countSublistTasks(sublistId, listTasks);

    return NextResponse.json({ ...sublist, task_count: taskCount });
});

/**
 * PATCH /api/sublists/[id]
 * Updates a sublist's name, color, or position. Returns the updated sublist.
 */
export const PATCH = withApiErrorHandling(async function PATCH(request, { params }) {
    const { id: sublistId } = await params;
    const body = await request.json();
    return actionResponse(await updateSublist(sublistId, body));
});

/**
 * DELETE /api/sublists/[id]
 * Deletes a sublist. Cascades to its tasks.
 */
export const DELETE = withApiErrorHandling(async function DELETE(request, { params }) {
    const { id: sublistId } = await params;
    return actionResponse(await deleteSublist(sublistId));
});
