import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { updateSublist, deleteSublist } from '@/actions/sublist-actions';
import { withApiErrorHandling, actionResponse, requireAuthResponse } from '@/lib/api-response';

/**
 * GET /api/sublists/[id]
 * Returns one sublist plus its task_count, so delete confirmations can warn
 * exactly how many tasks a cascade would remove.
 */
export const GET = withApiErrorHandling(async function GET(request, { params }) {
    const unauthorized = await requireAuthResponse();
    if (unauthorized) return unauthorized;

    const { id: sublistId } = await params;
    const supabase = await createClient();

    const [{ data: sublist, error }, { count: taskCount }] = await Promise.all([
        supabase.from('sublists').select('*').eq('id', sublistId).single(),
        supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('sublist_id', sublistId),
    ]);

    if (error) {
        return NextResponse.json({ error: 'Sublist not found' }, { status: 404 });
    }

    return NextResponse.json({ ...sublist, task_count: taskCount ?? 0 });
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
