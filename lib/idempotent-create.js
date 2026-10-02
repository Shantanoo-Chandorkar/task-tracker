import { isUuid } from '@/lib/validation';
import { INVALID_REQUEST_ID } from '@/lib/error-codes';

const UNIQUE_VIOLATION = '23505';

/**
 * Tells whether a database error is a primary-key or unique clash.
 *
 * @param {{ code?: string }|null|undefined} databaseError - Error returned by a Supabase call.
 * @returns {boolean} True for a unique violation.
 */
export function isUniqueViolation(databaseError) {
    return databaseError?.code === UNIQUE_VIOLATION;
}

/**
 * Reads the optional client-made row id from a create request, so a retry can find the row the first try made.
 *
 * @param {{ id?: unknown }} fields - The create request's fields.
 * @returns {{ id: string|undefined, failure: { error: string, code: string }|null }} The valid id (or none),
 *   or a failure to return to the caller when the id is not a UUID.
 */
export function readClientId(fields) {
    const candidateId = fields.id;
    if (candidateId === undefined || candidateId === null || candidateId === '') {
        return { id: undefined, failure: null };
    }
    if (!isUuid(candidateId)) {
        return {
            id: undefined,
            failure: { error: 'Invalid request id', code: INVALID_REQUEST_ID },
        };
    }
    return { id: candidateId, failure: null };
}

/**
 * Finds a row by id, but only if the caller created it, so a client-chosen id can never read someone else's row.
 *
 * @param {object} supabase - Request-scoped Supabase client (subject to RLS).
 * @param {string} table - Table to read.
 * @param {string|undefined} rowId - The client-made id; nothing is queried when it is missing.
 * @param {string} ownerColumn - Column holding the creator, `created_by` or `owner_id`.
 * @param {string} userId - The caller's user id.
 * @returns {Promise<object|null>} The caller's own row, or null.
 */
export async function findOwnRowById(supabase, table, rowId, ownerColumn, userId) {
    if (!rowId) return null;
    const { data: existingRow } = await supabase
        .from(table)
        .select('*')
        .eq('id', rowId)
        .maybeSingle();
    return existingRow?.[ownerColumn] === userId ? existingRow : null;
}

/**
 * Inserts a row with the client-made id, and when two requests with the same id collide returns the winner's row.
 *
 * @param {object} supabase - Request-scoped Supabase client.
 * @param {string} table - Table to insert into.
 * @param {object} row - The row's fields, already validated and allowlisted by the caller.
 * @param {{ clientId?: string, ownerColumn: string, userId: string }} options - The id to use and who owns the row.
 * @returns {Promise<{ data: object|null, error: object|null }>} Same shape as a Supabase insert.
 */
export async function insertRowOnce(supabase, table, row, { clientId, ownerColumn, userId }) {
    const { data, error } = await supabase
        .from(table)
        .insert({ ...(clientId && { id: clientId }), ...row })
        .select()
        .single();

    if (isUniqueViolation(error) && clientId) {
        const winnerRow = await findOwnRowById(supabase, table, clientId, ownerColumn, userId);
        if (winnerRow) return { data: winnerRow, error: null };
    }
    return { data, error };
}
