import { createClient } from '@/lib/supabase/server';
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

/**
 * DELETE /api/tasks/[id]
 * Deletes a task. Children are removed via ON DELETE CASCADE in the database.
 */
export async function DELETE(request, { params }) {
    const { id } = await params;

    try {
        const supabase = await createClient();

        const { error } = await supabase.from('tasks').delete().eq('id', id);

        if (error) {
            return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
        }

        revalidateTag('task-tree');
        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
