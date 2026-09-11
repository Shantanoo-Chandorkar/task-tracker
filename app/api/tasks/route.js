import { createClient } from '@/lib/supabase/server';
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { getNestingMode, isDepthAllowed } from '@/lib/config';

/**
 * GET /api/tasks?list_id=<id>
 * Returns the flat task list for one list, with status details joined in.
 * TanStack Query uses this endpoint for all client-side refetches.
 */
export async function GET(request) {
    try {
        const supabase = await createClient();
        const listId = request.nextUrl.searchParams.get('list_id');

        if (!listId) {
            return NextResponse.json({ error: 'list_id is required' }, { status: 400 });
        }

        const { data: tasks, error } = await supabase
            .from('tasks')
            .select('*, statuses(id, name, color, is_default, position)')
            .eq('list_id', listId)
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
        const { title, description, status_id, parent_id, sublist_id, position, list_id } = body;

        if (!title || title.trim() === '') {
            return NextResponse.json({ error: 'Title is required' }, { status: 400 });
        }
        if (!list_id) {
            return NextResponse.json({ error: 'list_id is required' }, { status: 400 });
        }
        if (sublist_id && parent_id) {
            return NextResponse.json(
                { error: "A subtask can't belong to a sublist directly" },
                { status: 400 },
            );
        }

        if (sublist_id) {
            const { data: sublist } = await supabase
                .from('sublists')
                .select('list_id')
                .eq('id', sublist_id)
                .single();
            if (!sublist || sublist.list_id !== list_id) {
                return NextResponse.json(
                    { error: 'Sublist does not belong to this list' },
                    { status: 400 },
                );
            }
        }

        let depth = 0;
        if (parent_id) {
            const { data: parent } = await supabase
                .from('tasks')
                .select('depth')
                .eq('id', parent_id)
                .single();
            if (parent) depth = parent.depth + 1;
        }

        const nestingMode = await getNestingMode();
        if (!isDepthAllowed(depth, nestingMode)) {
            return NextResponse.json(
                { error: 'Maximum nesting depth reached' },
                { status: 400 },
            );
        }

        let computedPosition = position;
        if (computedPosition === undefined || computedPosition === null) {
            let siblingQuery;
            if (parent_id) {
                siblingQuery = supabase
                    .from('tasks')
                    .select('position')
                    .eq('parent_id', parent_id)
                    .order('position', { ascending: false })
                    .limit(1);
            } else {
                siblingQuery = supabase
                    .from('tasks')
                    .select('position')
                    .eq('list_id', list_id)
                    .is('parent_id', null)
                    .order('position', { ascending: false })
                    .limit(1);
                siblingQuery = sublist_id
                    ? siblingQuery.eq('sublist_id', sublist_id)
                    : siblingQuery.is('sublist_id', null);
            }

            const { data: siblings } = await siblingQuery;
            computedPosition = siblings && siblings.length > 0 ? siblings[0].position + 1 : 1;
        }

        const { data: createdTask, error } = await supabase
            .from('tasks')
            .insert({
                title: title.trim(),
                description: description ?? null,
                status_id: status_id ?? null,
                parent_id: parent_id ?? null,
                sublist_id: parent_id ? null : (sublist_id ?? null),
                list_id,
                position: computedPosition,
                depth,
            })
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
        }

        revalidateTag('task-tree');
        return NextResponse.json(createdTask, { status: 201 });
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
