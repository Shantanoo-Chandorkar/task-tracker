/**
 * Computes the position for a new row appended to the end of its sibling group (highest + 1).
 *
 * @param {object} supabase - Supabase client
 * @param {string} table - Table name
 * @param {object} filters - Column/value pairs narrowing the sibling group; a `null` value means that column is null
 * @param {number} [emptyValue] - Position to use when there are no existing siblings (default 0)
 * @returns {Promise<number>} The next position value
 */
export async function getNextPosition(supabase, table, filters, emptyValue = 0) {
    let query = supabase.from(table).select('position').order('position', { ascending: false }).limit(1);
    for (const [column, value] of Object.entries(filters)) {
        query = value === null ? query.is(column, null) : query.eq(column, value);
    }

    const { data: existing } = await query;
    return existing && existing.length > 0 ? existing[0].position + 1 : emptyValue;
}
