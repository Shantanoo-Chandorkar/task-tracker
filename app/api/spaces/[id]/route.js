import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { withApiErrorHandling, requireAuthResponse, apiErrorResponse } from '@/lib/api-response';
import { SPACE_NOT_FOUND } from '@/lib/error-codes';

/**
 * GET /api/spaces/[id]
 * Returns one space plus list_count and task_count, so delete confirmations
 * can warn exactly how much a cascade would remove.
 */
export const GET = withApiErrorHandling(async function GET(request, { params }) {
    const unauthorized = await requireAuthResponse();
    if (unauthorized) return unauthorized;

    const { id } = await params;
    const supabase = await createClient();

    const { data: space, error } = await supabase.from('spaces').select('*').eq('id', id).single();

    if (error) {
        return apiErrorResponse('Space not found', SPACE_NOT_FOUND, 404);
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
