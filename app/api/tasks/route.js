import { createClient } from '@/lib/supabase/server';
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

/**
 * GET /api/tasks
 * Returns the full flat task list with status details joined in.
 * TanStack Query uses this endpoint for all client-side refetches.
 */
export async function GET() {
    try {
        const supabase = await createClient();

        const { data: tasks, error } = await supabase
            .from('tasks')
            .select('*, statuses(id, name, color, is_default, position)')
            .order('depth', { ascending: true })
            .order('position', { ascending: true });

        if (error) {
            return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
        }

        // Flatten the nested statuses object to top-level status_name / status_color fields
        // so callers don't need to know about the join structure
        const normalized = (tasks || []).map((task) => ({
            ...task,
            status_name: task.statuses?.name ?? null,
            status_color: task.statuses?.color ?? null,
        }));

        return NextResponse.json(normalized);
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * POST /api/tasks
 * Creates a new task. Computes depth from parent and position as last sibling + 1.
 */
export async function POST(request) {
    try {
        const supabase = await createClient();
        const body = await request.json();
        const { title, description, status_id, parent_id, position } = body;

        if (!title || title.trim() === '') {
            return NextResponse.json({ error: 'Title is required' }, { status: 400 });
        }

        // Compute depth from parent
        let depth = 0;
        if (parent_id) {
            const { data: parent } = await supabase
                .from('tasks')
                .select('depth')
                .eq('id', parent_id)
                .single();
            if (parent) depth = parent.depth + 1;
        }

        // Compute position as last sibling + 1 if not provided
        let computedPosition = position;
        if (computedPosition === undefined || computedPosition === null) {
            const siblingQuery = parent_id
                ? supabase
                      .from('tasks')
                      .select('position')
                      .eq('parent_id', parent_id)
                      .order('position', { ascending: false })
                      .limit(1)
                : supabase
                      .from('tasks')
                      .select('position')
                      .is('parent_id', null)
                      .order('position', { ascending: false })
                      .limit(1);

            const { data: siblings } = await siblingQuery;
            computedPosition = siblings && siblings.length > 0 ? siblings[0].position + 1 : 1;
        }

        const { data, error } = await supabase
            .from('tasks')
            .insert({
                title: title.trim(),
                description: description ?? null,
                status_id: status_id ?? null,
                parent_id: parent_id ?? null,
                position: computedPosition,
                depth,
            })
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
        }

        revalidateTag('task-tree');
        return NextResponse.json(data, { status: 201 });
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
