import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { createList } from '@/actions/list-actions';
import { withApiErrorHandling, actionResponse } from '@/lib/api-response';

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

    const [{ data: lists, error }, { data: tasks }] = await Promise.all([
        query,
        supabase.from('tasks').select('list_id'),
    ]);

    if (error) {
        return NextResponse.json({ error: 'Failed to fetch lists' }, { status: 500 });
    }

    const taskCountByListId = new Map();
    for (const task of tasks || []) {
        taskCountByListId.set(task.list_id, (taskCountByListId.get(task.list_id) ?? 0) + 1);
    }

    const listsWithCounts = (lists || []).map((list) => ({
        ...list,
        task_count: taskCountByListId.get(list.id) ?? 0,
    }));

    return NextResponse.json(listsWithCounts);
});

/**
 * POST /api/lists
 * Creates a new list under a space. Appends it to the end of that space's lists.
 */
export const POST = withApiErrorHandling(async function POST(request) {
    const body = await request.json();
    return actionResponse(await createList(body), 201);
});
