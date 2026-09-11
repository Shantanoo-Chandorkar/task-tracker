import { createClient } from '@/lib/supabase/server';
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

/**
 * GET /api/sublists?list_id=<id>
 * Returns the sublists for one list, ordered by position, each with a task_count.
 * list_id is required - sublists only ever make sense scoped to one list.
 */
export async function GET(request) {
    try {
        const supabase = await createClient();
        const listId = request.nextUrl.searchParams.get('list_id');

        if (!listId) {
            return NextResponse.json({ error: 'list_id is required' }, { status: 400 });
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
            return NextResponse.json({ error: 'Failed to fetch sublists' }, { status: 500 });
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
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * POST /api/sublists
 * Creates a new sublist under a list. Appends it to the end of that list's sublists.
 */
export async function POST(request) {
    try {
        const supabase = await createClient();
        const body = await request.json();
        const { name, color, list_id } = body;

        if (!name || name.trim() === '') {
            return NextResponse.json({ error: 'Sublist name is required' }, { status: 400 });
        }
        if (!list_id) {
            return NextResponse.json({ error: 'A list is required' }, { status: 400 });
        }

        const { data: existing } = await supabase
            .from('sublists')
            .select('position')
            .eq('list_id', list_id)
            .order('position', { ascending: false })
            .limit(1);

        const position = existing && existing.length > 0 ? existing[0].position + 1 : 0;

        const { data: createdSublist, error } = await supabase
            .from('sublists')
            .insert({ name: name.trim(), list_id, color: color ?? '#6b7280', position })
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: 'Failed to create sublist' }, { status: 500 });
        }

        revalidateTag('sublists');
        return NextResponse.json(createdSublist, { status: 201 });
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
