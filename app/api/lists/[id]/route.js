import { createClient } from '@/lib/supabase/server';
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

/**
 * GET /api/lists/[id]
 * Returns one list plus its task_count, so delete confirmations can warn
 * exactly how many tasks a cascade would remove.
 */
export async function GET(request, { params }) {
    const { id } = await params;

    try {
        const supabase = await createClient();

        const [{ data: list, error }, { count: taskCount }] = await Promise.all([
            supabase.from('lists').select('*').eq('id', id).single(),
            supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('list_id', id),
        ]);

        if (error) {
            return NextResponse.json({ error: 'List not found' }, { status: 404 });
        }

        return NextResponse.json({ ...list, task_count: taskCount ?? 0 });
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * PATCH /api/lists/[id]
 * Updates a list's name, color, or position. Returns the updated list.
 */
export async function PATCH(request, { params }) {
    const { id } = await params;

    try {
        const supabase = await createClient();
        const body = await request.json();

        const { data, error } = await supabase
            .from('lists')
            .update(body)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return NextResponse.json({ error: 'List not found' }, { status: 404 });
            }
            return NextResponse.json({ error: 'Failed to update list' }, { status: 500 });
        }

        revalidateTag('lists');
        return NextResponse.json(data);
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * DELETE /api/lists/[id]
 * Deletes a list. Cascades to its tasks.
 */
export async function DELETE(request, { params }) {
    const { id } = await params;

    try {
        const supabase = await createClient();

        const { error } = await supabase.from('lists').delete().eq('id', id);

        if (error) {
            return NextResponse.json({ error: 'Failed to delete list' }, { status: 500 });
        }

        revalidateTag('lists');
        revalidateTag('task-tree');
        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
