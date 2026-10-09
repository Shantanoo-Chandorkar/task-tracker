import {
    blockWriteForPermission,
    resolveSpacePermission,
} from '@/lib/permissions/space-permissions';

/**
 * Loads a space label by id and checks the caller may change or delete it.
 *
 * @param {object} supabase - Request-scoped Supabase client
 * @param {object} user - The signed-in user
 * @param {object} target
 * @param {string} target.table - Table holding the label
 * @param {string} target.id - Label to load
 * @param {string} [target.columns] - Extra columns to read beside `space_id` and `created_by`
 * @param {object} target.notFoundFailure - What to hand back when no such label is visible to the caller
 * @returns {Promise<{ label: object, failure: null }|{ label: null, failure: object }>} The row, or the failure
 *   to return to the caller (not found, or the permission refusal)
 * @throws {Error} Generic SERVER_LOAD_FAILED error when the permission read fails
 */
export async function loadLabelForWrite(supabase, user, { table, id, columns, notFoundFailure }) {
    const { data: label } = await supabase
        .from(table)
        .select(columns ? `space_id, created_by, ${columns}` : 'space_id, created_by')
        .eq('id', id)
        .maybeSingle();
    if (!label) return { label: null, failure: notFoundFailure };

    const permissionLevel = await resolveSpacePermission(supabase, label.space_id);
    const permissionBlock = blockWriteForPermission(permissionLevel, {
        isOwnRow: label.created_by === user.id,
    });
    if (permissionBlock) return { label: null, failure: permissionBlock };

    return { label, failure: null };
}
