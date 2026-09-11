import { createClient } from '@/lib/supabase/server';
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { canMarkTaskDone, getDoneStatusId } from '@/lib/task-completion';

/**
 * PATCH /api/tasks/[id]
 * Updates any subset of task fields. Returns the updated task.
 */
export async function PATCH(request, { params }) {
    const { id } = await params;

    try {
        const supabase = await createClient();
        const body = await request.json();

        if (Object.keys(body).length === 0) {
            return NextResponse.json({ error: 'No fields provided to update' }, { status: 400 });
        }

        if (body.status_id) {
            const doneStatusId = await getDoneStatusId(supabase);
            if (doneStatusId && body.status_id === doneStatusId) {
                const canComplete = await canMarkTaskDone(supabase, id, doneStatusId);
                if (!canComplete) {
                    return NextResponse.json(
                        { error: 'Complete all subtasks before marking this task done' },
                        { status: 409 },
                    );
                }
            }
        }

        const { data, error } = await supabase
            .from('tasks')
            .update(body)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return NextResponse.json({ error: 'Task not found' }, { status: 404 });
            }
            return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
        }

        revalidateTag('task-tree');
        return NextResponse.json(data);
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

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
