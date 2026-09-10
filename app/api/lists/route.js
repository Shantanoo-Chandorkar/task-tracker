import { createClient } from '@/lib/supabase/server';
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

/**
 * GET /api/lists
 * Returns lists ordered by position, each with a task_count, for the sidebar
 * nav. Optionally filtered by ?space_id=. With no filter, returns every list
 * across every space (used to build nav).
 */
export async function GET(request) {
    try {
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
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * POST /api/lists
 * Creates a new list under a space. Appends it to the end of that space's lists.
 */
export async function POST(request) {
    try {
        const supabase = await createClient();
        const body = await request.json();
        const { name, color, space_id } = body;

        if (!name || name.trim() === '') {
            return NextResponse.json({ error: 'List name is required' }, { status: 400 });
        }
        if (!space_id) {
            return NextResponse.json({ error: 'A space is required' }, { status: 400 });
        }

        const { data: existing } = await supabase
            .from('lists')
            .select('position')
            .eq('space_id', space_id)
            .order('position', { ascending: false })
            .limit(1);

        const position = existing && existing.length > 0 ? existing[0].position + 1 : 0;

        const { data, error } = await supabase
            .from('lists')
            .insert({ name: name.trim(), space_id, color: color ?? '#6b7280', position })
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: 'Failed to create list' }, { status: 500 });
        }

        revalidateTag('lists');
        return NextResponse.json(data, { status: 201 });
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
