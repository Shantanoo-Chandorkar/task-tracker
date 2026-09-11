import { createClient } from '@/lib/supabase/server';
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

/**
 * GET /api/sublists/[id]
 * Returns one sublist plus its task_count, so delete confirmations can warn
 * exactly how many tasks a cascade would remove.
 */
export async function GET(request, { params }) {
    const { id: sublistId } = await params;

    try {
        const supabase = await createClient();

        const [{ data: sublist, error }, { count: taskCount }] = await Promise.all([
            supabase.from('sublists').select('*').eq('id', sublistId).single(),
            supabase
                .from('tasks')
                .select('*', { count: 'exact', head: true })
                .eq('sublist_id', sublistId),
        ]);

        if (error) {
            return NextResponse.json({ error: 'Sublist not found' }, { status: 404 });
        }

        return NextResponse.json({ ...sublist, task_count: taskCount ?? 0 });
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * PATCH /api/sublists/[id]
 * Updates a sublist's name, color, or position. Returns the updated sublist.
 */
export async function PATCH(request, { params }) {
    const { id: sublistId } = await params;

    try {
        const supabase = await createClient();
        const body = await request.json();

        const { data: updatedSublist, error } = await supabase
            .from('sublists')
            .update(body)
            .eq('id', sublistId)
            .select()
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return NextResponse.json({ error: 'Sublist not found' }, { status: 404 });
            }
            return NextResponse.json({ error: 'Failed to update sublist' }, { status: 500 });
        }

        revalidateTag('sublists');
        return NextResponse.json(updatedSublist);
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * DELETE /api/sublists/[id]
 * Deletes a sublist. Cascades to its tasks.
 */
export async function DELETE(request, { params }) {
    const { id: sublistId } = await params;

    try {
        const supabase = await createClient();

        const { error } = await supabase.from('sublists').delete().eq('id', sublistId);

        if (error) {
            return NextResponse.json({ error: 'Failed to delete sublist' }, { status: 500 });
        }

        revalidateTag('sublists');
        revalidateTag('task-tree');
        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
