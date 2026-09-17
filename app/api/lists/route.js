import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { createList } from '@/actions/list-actions';
import { withApiErrorHandling, actionResponse } from '@/lib/api-response';
import { attachTaskCounts } from '@/lib/list-task-counts';

/**
 * GET /api/lists
 * Returns lists ordered by position, each with a task_count, for the sidebar
 * nav. Optionally filtered by ?space_id=. With no filter, returns every list
 * across every space (used to build nav).
 */
export const GET = withApiErrorHandling(async function GET(request) {
    const supabase = await createClient();
    const spaceId = request.nextUrl.searchParams.get('space_id');

    let query = supabase.from('lists').select('*').order('position', { ascending: true });
    if (spaceId) query = query.eq('space_id', spaceId);

    const { data: lists, error } = await query;

    if (error) {
        return NextResponse.json({ error: 'Failed to fetch lists' }, { status: 500 });
    }

    return NextResponse.json(await attachTaskCounts(supabase, lists || []));
});

/**
 * POST /api/lists
 * Creates a new list under a space. Appends it to the end of that space's lists.
 */
export const POST = withApiErrorHandling(async function POST(request) {
    const body = await request.json();
    return actionResponse(await createList(body), 201);
});
