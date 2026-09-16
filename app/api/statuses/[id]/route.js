import { updateStatus, deleteStatus } from '@/actions/status-actions';
import { withApiErrorHandling, actionResponse } from '@/lib/api-response';

/**
 * PATCH /api/statuses/[id]
 * Updates a status's name, color, or position. Returns the updated status.
 * `code` can never be set through this route — `updateStatus` whitelists fields.
 */
export const PATCH = withApiErrorHandling(async function PATCH(request, { params }) {
    const { id } = await params;
    const body = await request.json();
    return actionResponse(await updateStatus(id, body));
});

/**
 * DELETE /api/statuses/[id]
 * Deletes a status; refuses the last remaining, default, or built-in one (`deleteStatus` enforces all three).
 */
export const DELETE = withApiErrorHandling(async function DELETE(request, { params }) {
    const { id } = await params;
    return actionResponse(await deleteStatus(id));
});
