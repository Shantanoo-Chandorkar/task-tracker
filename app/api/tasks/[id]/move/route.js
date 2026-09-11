import { NextResponse } from 'next/server';
import { moveTask } from '@/actions/task-actions';

/**
 * POST /api/tasks/[id]/move
 * Thin HTTP wrapper around the moveTask server action — drag-reorder posts JSON here since
 * it isn't a direct server-action call site. The menu-driven move actions and the offline
 * mutation registry call moveTask directly.
 *
 * Body: { newParentId: uuid|null, afterSiblingId: uuid|null, shouldPrependToStart?: boolean,
 *   listId?: uuid, sublistId?: uuid|null }
 */
export async function POST(request, { params }) {
    const { id: taskId } = await params;

    try {
        const body = await request.json();
        const { data, error } = await moveTask(taskId, body);

        if (error) {
            return NextResponse.json({ error }, { status: error === 'Task not found' ? 404 : 400 });
        }

        return NextResponse.json(data);
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
