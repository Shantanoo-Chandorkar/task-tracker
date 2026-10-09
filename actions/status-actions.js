'use server';

import { createLabelActions } from '@/lib/space-labels/create-label-actions';

/**
 * Refuses a status delete that would leave the space without a usable status.
 *
 * @param {object} supabase - Request-scoped Supabase client
 * @param {{ space_id: string, is_default: boolean, code: string|null }} status - The status being deleted
 * @returns {Promise<{ error: string }|null>} The refusal, or null when the delete may go ahead
 */
async function refuseUndeletableStatus(supabase, status) {
    // Scoped to this status's own space: other spaces' statuses must never count as "remaining"
    const { count } = await supabase
        .from('statuses')
        .select('*', { count: 'exact', head: true })
        .eq('space_id', status.space_id);

    if (count <= 1) return { error: 'Cannot delete the last remaining status' };
    if (status.is_default) return { error: 'Cannot delete the default status' };
    if (status.code) return { error: 'Cannot delete a built-in status' };
    return null;
}

// `code` identifies the 3 built-in statuses and is not writable through these actions, even indirectly
const statusActions = createLabelActions({
    table: 'statuses',
    noun: 'Status',
    logName: 'statuses',
    deleteColumns: 'is_default, code',
    guardDelete: refuseUndeletableStatus,
});

/**
 * Creates a status at the end of its space's order.
 *
 * @param {object} fields
 * @param {string} [fields.id] - Optional client-made UUID; a retry with the same id returns the first try's row
 * @param {string} fields.name - Required status name
 * @param {string} fields.space_id - Required space this status belongs to
 * @param {string} [fields.color] - `#rrggbb`, defaults to grey
 * @returns {{ data: object|null, error: string|null }}
 */
export const createStatus = statusActions.create;

/**
 * Updates the name, colour or position of a status.
 *
 * @param {string} id - Status ID to update
 * @param {object} fields - Partial fields to update (name, color, position only)
 * @returns {{ data: object|null, error: string|null }}
 */
export const updateStatus = statusActions.update;

/**
 * Deletes a status. Refuses if it is the last remaining status, the default status or a built-in one.
 *
 * @param {string} id - Status ID to delete
 * @returns {{ error: string|null }}
 */
export const deleteStatus = statusActions.remove;
