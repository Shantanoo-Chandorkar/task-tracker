import {
    blockWriteForPermission,
    resolveSpacePermission,
} from '@/lib/permissions/space-permissions';

/**
 * Loads a space label by id and checks the caller may change or delete it.
 *
 * @param {SupabaseClient} supabase - Request-scoped Supabase client
 * @param {AuthUser} user - The signed-in user
 * @param {object} target
 * @param {string} target.table - Table holding the label
 * @param {string} target.id - Label to load
 * @param {string} [target.columns] - Extra columns to read beside `space_id` and `created_by`
 * @param {Record<string, any>} target.notFoundFailure - What to hand back when no such label is visible to the caller
 * @returns {Promise<{ label: Record<string, any>, failure: null }|{ label: null, failure: Record<string, any> }>}
 *   The row, or the failure to return to the caller (not found, or the permission refusal)
 * @throws {Error} Generic SERVER_LOAD_FAILED error when the permission read fails
 */
export async function loadLabelForWrite(supabase, user, { table, id, columns, notFoundFailure }) {
    const { data: labelRow } = await supabase
        .from(table)
        .select(columns ? `space_id, created_by, ${columns}` : 'space_id, created_by')
        .eq('id', id)
        .maybeSingle();
    if (!labelRow) return { label: null, failure: notFoundFailure };
    // The select string is built dynamically, so supabase-js's literal-string row-shape parser can't infer it
    const label = /** @type {Record<string, any>} */ (labelRow);

    const permissionLevel = await resolveSpacePermission(supabase, label.space_id);
    const permissionBlock = blockWriteForPermission(permissionLevel, {
        isOwnRow: label.created_by === user.id,
    });
    if (permissionBlock) return { label: null, failure: permissionBlock };

    return { label, failure: null };
}
