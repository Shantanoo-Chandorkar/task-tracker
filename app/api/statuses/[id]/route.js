import { createClient } from '@/lib/supabase/server';
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

/**
 * PATCH /api/statuses/[id]
 * Updates a status's name, color, or position. Returns the updated status.
 */
export async function PATCH(request, { params }) {
    const { id } = await params;

    try {
        const supabase = await createClient();
        const body = await request.json();

        const { data, error } = await supabase
            .from('statuses')
            .update(body)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return NextResponse.json({ error: 'Status not found' }, { status: 404 });
            }
            return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
        }

        revalidateTag('statuses');
        revalidateTag('task-tree');
        return NextResponse.json(data);
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * DELETE /api/statuses/[id]
 * Deletes a status. Refuses with 400 if it is the only status or the default status.
 */
export async function DELETE(request, { params }) {
    const { id } = await params;

    try {
        const supabase = await createClient();

        const { count } = await supabase
            .from('statuses')
            .select('*', { count: 'exact', head: true });

        if (count <= 1) {
            return NextResponse.json(
                { error: 'Cannot delete the last remaining status' },
                { status: 400 },
            );
        }

        const { data: target } = await supabase
            .from('statuses')
            .select('is_default')
            .eq('id', id)
            .single();

        if (target?.is_default) {
            return NextResponse.json(
                { error: 'Cannot delete the default status' },
                { status: 400 },
            );
        }

        const { error } = await supabase.from('statuses').delete().eq('id', id);

        if (error) {
            return NextResponse.json({ error: 'Failed to delete status' }, { status: 500 });
        }

        revalidateTag('statuses');
        revalidateTag('task-tree');
        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
