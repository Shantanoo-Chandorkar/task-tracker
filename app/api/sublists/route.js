import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import {
    withApiErrorHandling,
    requireAuthResponse,
    apiErrorResponse,
    queryFailedResponse,
} from '@/lib/api-response';
import { SUBLISTS_LIST_ID_REQUIRED, SUBLISTS_LOAD_FAILED } from '@/lib/error-codes';

/**
 * GET /api/sublists?list_id=<id>
 * Returns the sublists for one list, ordered by position, each with a task_count.
 * list_id is required - sublists only ever make sense scoped to one list.
 */
export const GET = withApiErrorHandling(async function GET(request) {
    const unauthorized = await requireAuthResponse();
    if (unauthorized) return unauthorized;

    const supabase = await createClient();
    const listId = request.nextUrl.searchParams.get('list_id');

    if (!listId) {
        return apiErrorResponse('list_id is required', SUBLISTS_LIST_ID_REQUIRED, 400);
    }

    const [{ data: sublists, error }, { data: tasks }] = await Promise.all([
        supabase
            .from('sublists')
            .select('*')
            .eq('list_id', listId)
            .order('position', { ascending: true }),
        supabase.from('tasks').select('sublist_id').eq('list_id', listId),
    ]);

    if (error) {
        return queryFailedResponse(
            '[api/sublists]',
            error,
            'Failed to fetch sublists',
            SUBLISTS_LOAD_FAILED,
        );
    }

    const taskCountBySublistId = new Map();
    for (const task of tasks || []) {
        if (!task.sublist_id) continue;
        taskCountBySublistId.set(
            task.sublist_id,
            (taskCountBySublistId.get(task.sublist_id) ?? 0) + 1,
        );
    }

    const sublistsWithCounts = (sublists || []).map((sublist) => ({
        ...sublist,
        task_count: taskCountBySublistId.get(sublist.id) ?? 0,
    }));

    return NextResponse.json(sublistsWithCounts);
});
