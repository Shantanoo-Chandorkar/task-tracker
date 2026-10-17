import { updateHabit, deleteHabit } from '@/modules/habits/actions/habit-actions';
import { withApiErrorHandling, actionResponse } from '@/lib/api-response';

/**
 * PATCH /api/habits/[id]
 * Updates a habit's fields - `updateHabit` validates and allowlists everything the client sends.
 */
export const PATCH = withApiErrorHandling(async function PATCH(request, { params }) {
    const { id } = await params;
    const body = await request.json();
    return actionResponse(await updateHabit(id, body));
});

/**
 * DELETE /api/habits/[id]
 * Deletes a habit permanently, cascading to its check-ins - chosen over archiving per user sign-off.
 */
export const DELETE = withApiErrorHandling(async function DELETE(request, { params }) {
    const { id } = await params;
    return actionResponse(await deleteHabit(id));
});
