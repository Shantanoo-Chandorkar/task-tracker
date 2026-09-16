import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { updateSpace, deleteSpace } from '@/actions/space-actions';
import { withApiErrorHandling, actionResponse } from '@/lib/api-response';

/**
 * GET /api/spaces/[id]
 * Returns one space plus list_count and task_count, so delete confirmations
 * can warn exactly how much a cascade would remove.
 */
export const GET = withApiErrorHandling(async function GET(request, { params }) {
    const { id } = await params;
    const supabase = await createClient();

    const { data: space, error } = await supabase.from('spaces').select('*').eq('id', id).single();

    if (error) {
        return NextResponse.json({ error: 'Space not found' }, { status: 404 });
    }

    const { data: lists } = await supabase.from('lists').select('id').eq('space_id', id);
    const listIds = (lists || []).map((list) => list.id);

    let taskCount = 0;
    if (listIds.length > 0) {
        const { count } = await supabase
            .from('tasks')
            .select('*', { count: 'exact', head: true })
            .in('list_id', listIds);
        taskCount = count ?? 0;
    }

    return NextResponse.json({ ...space, list_count: listIds.length, task_count: taskCount });
});

/**
 * PATCH /api/spaces/[id]
 * Updates a space's name, color, or position. Returns the updated space.
 */
export const PATCH = withApiErrorHandling(async function PATCH(request, { params }) {
    const { id } = await params;
    const body = await request.json();
    return actionResponse(await updateSpace(id, body));
});

/**
 * DELETE /api/spaces/[id]
 * Deletes a space. Cascades to its lists and their tasks.
 */
export const DELETE = withApiErrorHandling(async function DELETE(request, { params }) {
    const { id } = await params;
    return actionResponse(await deleteSpace(id));
});
