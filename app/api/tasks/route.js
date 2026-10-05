import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { createTask } from '@/actions/task-actions';
import { withApiErrorHandling, actionResponse, requireAuthResponse } from '@/lib/api-response';
import { fetchListTasks } from '@/lib/list-tasks';

/**
 * GET /api/tasks?list_id=<id>
 * Returns the flat task list for one list, with status details joined in.
 * TanStack Query uses this endpoint for all client-side refetches.
 */
export const GET = withApiErrorHandling(async function GET(request) {
    const unauthorized = await requireAuthResponse();
    if (unauthorized) return unauthorized;

    const supabase = await createClient();
    const listId = request.nextUrl.searchParams.get('list_id');

    if (!listId) {
        return NextResponse.json({ error: 'list_id is required' }, { status: 400 });
    }

    const { data: tasks, error } = await fetchListTasks(supabase, listId);

    if (error) {
        console.error('[api/tasks] load failed', {
            listId,
            code: error.code,
            detail: error.message,
        });
        return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
    }

    return NextResponse.json(tasks);
});

/**
 * POST /api/tasks
 * Creates a new task. Computes depth from parent and position as last sibling + 1.
 */
export const POST = withApiErrorHandling(async function POST(request) {
    const body = await request.json();
    return actionResponse(await createTask(body), 201);
});
