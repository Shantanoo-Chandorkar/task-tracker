import { withApiErrorHandling, actionResponse } from '@/lib/api-response';
import { moveTask } from '@/actions/task-actions';

/**
 * POST /api/tasks/[id]/move
 * Reparents a task and repositions it after a sibling; cascades depth (and list) to descendants.
 *
 * afterSiblingId: null means "append at the end"; shouldPrependToStart flags "insert at the start" instead.
 * sublistId only applies to root tasks (newParentId null); omitted on promote, it inherits the
 * task's original root ancestor's sublist.
 *
 * Body: { newParentId: uuid|null, afterSiblingId: uuid|null, shouldPrependToStart?: boolean,
 *   listId?: uuid, sublistId?: uuid|null }
 */
export const POST = withApiErrorHandling(async function POST(request, { params }) {
    const { id } = await params;
    const body = await request.json();
    return actionResponse(await moveTask(id, body));
});
