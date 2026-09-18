import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { updateList, deleteList } from '@/actions/list-actions';
import { withApiErrorHandling, actionResponse, requireAuthResponse } from '@/lib/api-response';

/**
 * GET /api/lists/[id]
 * Returns one list plus its task_count, so delete confirmations can warn
 * exactly how many tasks a cascade would remove.
 */
export const GET = withApiErrorHandling(async function GET(request, { params }) {
    const unauthorized = await requireAuthResponse();
    if (unauthorized) return unauthorized;

    const { id } = await params;
    const supabase = await createClient();

    const [{ data: list, error }, { count: taskCount }] = await Promise.all([
        supabase.from('lists').select('*').eq('id', id).single(),
        supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('list_id', id),
    ]);

    if (error) {
        return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }

    return NextResponse.json({ ...list, task_count: taskCount ?? 0 });
});

/**
 * PATCH /api/lists/[id]
 * Updates a list's name, color, or position. Returns the updated list.
 */
export const PATCH = withApiErrorHandling(async function PATCH(request, { params }) {
    const { id } = await params;
    const body = await request.json();
    return actionResponse(await updateList(id, body));
});

/**
 * DELETE /api/lists/[id]
 * Deletes a list. Cascades to its tasks.
 */
export const DELETE = withApiErrorHandling(async function DELETE(request, { params }) {
    const { id } = await params;
    return actionResponse(await deleteList(id));
});
