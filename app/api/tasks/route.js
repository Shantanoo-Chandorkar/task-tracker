import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { createTask } from '@/actions/task-actions';
import { withApiErrorHandling, actionResponse, requireAuthResponse } from '@/lib/api-response';

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

    const { data: tasks, error } = await supabase
        .from('tasks')
        .select('*, statuses(id, name, color, is_default, position), task_tags(tags(id, name))')
        .eq('list_id', listId)
        .order('depth', { ascending: true })
        .order('position', { ascending: true });

    if (error) {
        return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
    }

    // Flattens the statuses and task_tags joins so callers don't need to know either's structure.
    const normalized = (tasks || []).map((task) => ({
        ...task,
        status_name: task.statuses?.name ?? null,
        status_color: task.statuses?.color ?? null,
        tags: (task.task_tags || []).map((taskTagRow) => taskTagRow.tags),
    }));

    return NextResponse.json(normalized);
});

/**
 * POST /api/tasks
 * Creates a new task. Computes depth from parent and position as last sibling + 1.
 */
export const POST = withApiErrorHandling(async function POST(request) {
    const body = await request.json();
    return actionResponse(await createTask(body), 201);
});
