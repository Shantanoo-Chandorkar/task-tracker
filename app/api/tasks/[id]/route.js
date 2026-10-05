import { updateTask, deleteTask } from '@/actions/task-actions';
import { withApiErrorHandling, actionResponse, apiErrorResponse } from '@/lib/api-response';
import { TASK_UPDATE_EMPTY } from '@/lib/error-codes';

/**
 * PATCH /api/tasks/[id]
 * Updates any subset of task fields. Returns the updated task.
 * Delegates to `updateTask`, which enforces the done-status guard, sublist ownership, and recurrence recompute.
 */
export const PATCH = withApiErrorHandling(async function PATCH(request, { params }) {
    const { id } = await params;
    const body = await request.json();

    if (Object.keys(body).length === 0) {
        return apiErrorResponse('No fields provided to update', TASK_UPDATE_EMPTY, 400);
    }

    return actionResponse(await updateTask(id, body));
});

/**
 * DELETE /api/tasks/[id]
 * Deletes a task. Children are removed via ON DELETE CASCADE in the database.
 */
export const DELETE = withApiErrorHandling(async function DELETE(request, { params }) {
    const { id } = await params;
    return actionResponse(await deleteTask(id));
});
