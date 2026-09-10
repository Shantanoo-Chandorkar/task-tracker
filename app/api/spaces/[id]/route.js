import { createClient } from '@/lib/supabase/server';
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

/**
 * GET /api/spaces/[id]
 * Returns one space plus list_count and task_count, so delete confirmations
 * can warn exactly how much a cascade would remove.
 */
export async function GET(request, { params }) {
    const { id } = await params;

    try {
        const supabase = await createClient();

        const { data: space, error } = await supabase
            .from('spaces')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            return NextResponse.json({ error: 'Space not found' }, { status: 404 });
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
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * PATCH /api/spaces/[id]
 * Updates a space's name, color, or position. Returns the updated space.
 */
export async function PATCH(request, { params }) {
    const { id } = await params;

    try {
        const supabase = await createClient();
        const body = await request.json();

        const { data, error } = await supabase
            .from('spaces')
            .update(body)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return NextResponse.json({ error: 'Space not found' }, { status: 404 });
            }
            return NextResponse.json({ error: 'Failed to update space' }, { status: 500 });
        }

        revalidateTag('spaces');
        return NextResponse.json(data);
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * DELETE /api/spaces/[id]
 * Deletes a space. Cascades to its lists and their tasks.
 */
export async function DELETE(request, { params }) {
    const { id } = await params;

    try {
        const supabase = await createClient();

        const { error } = await supabase.from('spaces').delete().eq('id', id);

        if (error) {
            return NextResponse.json({ error: 'Failed to delete space' }, { status: 500 });
        }

        revalidateTag('spaces');
        revalidateTag('lists');
        revalidateTag('task-tree');
        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
