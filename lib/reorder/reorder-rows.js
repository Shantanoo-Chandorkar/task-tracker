import { getPositionChanges } from '@/lib/reorder/position-changes';
import { validateOrderedIds } from '@/lib/reorder/validate-ordered-ids';
import {
    blockWriteForPermission,
    getSpaceIdForList,
    resolveSpacePermission,
} from '@/lib/permissions/space-permissions';
import { throwIfQueryFailed } from '@/lib/supabase/throw-if-query-failed';
import { REORDER_ROWS_NOT_FOUND, REORDER_SAVE_FAILED } from '@/lib/error-codes';

const ROWS_NOT_FOUND_FAILURE = {
    error: 'Some of these items no longer exist. Reload and try again.',
    code: REORDER_ROWS_NOT_FOUND,
};
const SAVE_FAILED_FAILURE = { error: 'Failed to save the new order', code: REORDER_SAVE_FAILED };

/**
 * Loads the rows to reorder, refusing the whole request when any is missing or the caller may not change it.
 *
 * @param {object} supabase - Request-scoped Supabase client
 * @param {object} user - The signed-in user
 * @param {object} target - What is being reordered, see `saveOrderedRows`
 * @returns {Promise<{ savedRows: object[] }|{ failure: object }>} The rows as stored, or the failure to return
 * @throws {Error} Generic SERVER_LOAD_FAILED error when the read fails
 */
async function loadRowsForReorder(supabase, user, target) {
    const { table, creatorColumn, scopeColumn, scopeValue, permissionLevel, orderedIds } = target;
    const loadResult = await supabase
        .from(table)
        .select(`id, position, ${creatorColumn}`)
        .in('id', orderedIds)
        .eq(scopeColumn, scopeValue);
    throwIfQueryFailed(`[reorder] load ${table}`, loadResult);

    const savedRows = loadResult.data ?? [];
    // A row in another space, or one that is gone, looks the same as a missing one: nothing leaks about it
    if (savedRows.length !== orderedIds.length) return { failure: ROWS_NOT_FOUND_FAILURE };

    for (const savedRow of savedRows) {
        const permissionBlock = blockWriteForPermission(permissionLevel, {
            isOwnRow: savedRow[creatorColumn] === user.id,
        });
        if (permissionBlock) return { failure: permissionBlock };
    }
    return { savedRows };
}

/**
 * Writes positions 0, 1, 2, ... for the rows in the order the client sent, touching only rows that moved.
 *
 * Not atomic: if one update fails the others may already be saved, and the client reloads to show the truth.
 *
 * @param {object} supabase - Request-scoped Supabase client
 * @param {object} user - The signed-in user
 * @param {object} target
 * @param {string} target.table - Table of the rows
 * @param {string} target.creatorColumn - Column holding who made the row (`owner_id` for spaces)
 * @param {string} target.scopeColumn - Column the rows must share with `scopeValue` (their space, list or owner)
 * @param {string} target.scopeValue - Id every row must belong to
 * @param {string|null} target.permissionLevel - The caller's tier in the space, `owner` for their own spaces
 * @param {string[]} target.orderedIds - Row ids in the wanted order, already validated
 * @returns {Promise<{ error: string|null, code?: string }>} `{ error: null }` when saved, else the refusal
 * @throws {Error} Generic SERVER_LOAD_FAILED error when the read fails
 */
async function saveOrderedRows(supabase, user, target) {
    const loadOutcome = await loadRowsForReorder(supabase, user, target);
    if (loadOutcome.failure) return loadOutcome.failure;

    // Saved positions come from the database, never from the client
    const savedPositionById = new Map(loadOutcome.savedRows.map((row) => [row.id, row.position]));
    const positionChanges = getPositionChanges(
        target.orderedIds.map((id) => ({ id, position: savedPositionById.get(id) })),
    );

    const updateResults = await Promise.all(
        positionChanges.map(({ id, position }) =>
            supabase.from(target.table).update({ position }).eq('id', id).select('id'),
        ),
    );
    // An update blocked by RLS changes no row and raises no error, so an empty reply counts as failed
    const failedResult = updateResults.find(
        (updateResult) => updateResult.error || !updateResult.data?.length,
    );
    if (failedResult) {
        console.error('[reorder] update failed', {
            table: target.table,
            code: failedResult.error?.code,
            detail: failedResult.error?.message,
        });
        return SAVE_FAILED_FAILURE;
    }
    return { error: null };
}

/**
 * Reorders rows that live in a space: needs write access to the space, and `restricted` users only their own rows.
 *
 * @param {object} supabase - Request-scoped Supabase client
 * @param {object} user - The signed-in user
 * @param {object} target - Like `saveOrderedRows`, with `spaceId` instead of `permissionLevel`
 * @param {string} target.spaceId - Space the rows belong to
 * @returns {Promise<{ error: string|null, code?: string }>} `{ error: null }` when saved, else the refusal
 */
async function reorderRowsInSpace(supabase, user, { spaceId, ...target }) {
    const permissionLevel = await resolveSpacePermission(supabase, spaceId);
    // Read-only and non-members stop here; a restricted user is checked row by row after the rows load
    const accessBlock = blockWriteForPermission(permissionLevel, { isOwnRow: true });
    if (accessBlock) return accessBlock;

    return saveOrderedRows(supabase, user, { ...target, permissionLevel });
}

/**
 * Saves a new order for the caller's own spaces.
 *
 * @param {object} supabase - Request-scoped Supabase client
 * @param {object} user - The signed-in user
 * @param {unknown} orderedIds - Space ids in the wanted order
 * @returns {Promise<{ error: string|null, code?: string }>} `{ error: null }` when saved, else the refusal
 */
export async function reorderOwnedSpaces(supabase, user, orderedIds) {
    const validation = validateOrderedIds(orderedIds);
    if (validation.failure) return validation.failure;

    return saveOrderedRows(supabase, user, {
        table: 'spaces',
        creatorColumn: 'owner_id',
        scopeColumn: 'owner_id',
        scopeValue: user.id,
        permissionLevel: 'owner',
        orderedIds: validation.ids,
    });
}

/**
 * Saves a new order for the lists of one space.
 *
 * @param {object} supabase - Request-scoped Supabase client
 * @param {object} user - The signed-in user
 * @param {unknown} spaceId - Space the lists belong to
 * @param {unknown} orderedIds - List ids in the wanted order
 * @returns {Promise<{ error: string|null, code?: string }>} `{ error: null }` when saved, else the refusal
 */
export async function reorderListsInSpace(supabase, user, spaceId, orderedIds) {
    const validation = validateOrderedIds(orderedIds, [spaceId]);
    if (validation.failure) return validation.failure;

    return reorderRowsInSpace(supabase, user, {
        table: 'lists',
        creatorColumn: 'created_by',
        scopeColumn: 'space_id',
        scopeValue: spaceId,
        spaceId,
        orderedIds: validation.ids,
    });
}

/**
 * Saves a new order for the labels (statuses or tags) of one space.
 *
 * @param {object} supabase - Request-scoped Supabase client
 * @param {object} user - The signed-in user
 * @param {string} table - `statuses` or `tags`
 * @param {unknown} spaceId - Space the labels belong to
 * @param {unknown} orderedIds - Label ids in the wanted order
 * @returns {Promise<{ error: string|null, code?: string }>} `{ error: null }` when saved, else the refusal
 */
async function reorderLabelsInSpace(supabase, user, table, spaceId, orderedIds) {
    const validation = validateOrderedIds(orderedIds, [spaceId]);
    if (validation.failure) return validation.failure;

    return reorderRowsInSpace(supabase, user, {
        table,
        creatorColumn: 'created_by',
        scopeColumn: 'space_id',
        scopeValue: spaceId,
        spaceId,
        orderedIds: validation.ids,
    });
}

/**
 * Saves a new order for the statuses of one space.
 *
 * @param {object} supabase - Request-scoped Supabase client
 * @param {object} user - The signed-in user
 * @param {unknown} spaceId - Space the statuses belong to
 * @param {unknown} orderedIds - Status ids in the wanted order
 * @returns {Promise<{ error: string|null, code?: string }>} `{ error: null }` when saved, else the refusal
 */
export function reorderStatusesInSpace(supabase, user, spaceId, orderedIds) {
    return reorderLabelsInSpace(supabase, user, 'statuses', spaceId, orderedIds);
}

/**
 * Saves a new order for the tags of one space.
 *
 * @param {object} supabase - Request-scoped Supabase client
 * @param {object} user - The signed-in user
 * @param {unknown} spaceId - Space the tags belong to
 * @param {unknown} orderedIds - Tag ids in the wanted order
 * @returns {Promise<{ error: string|null, code?: string }>} `{ error: null }` when saved, else the refusal
 */
export function reorderTagsInSpace(supabase, user, spaceId, orderedIds) {
    return reorderLabelsInSpace(supabase, user, 'tags', spaceId, orderedIds);
}

/**
 * Saves a new order for the sublists of one list.
 *
 * @param {object} supabase - Request-scoped Supabase client
 * @param {object} user - The signed-in user
 * @param {unknown} listId - List the sublists belong to
 * @param {unknown} orderedIds - Sublist ids in the wanted order
 * @returns {Promise<{ error: string|null, code?: string }>} `{ error: null }` when saved, else the refusal
 */
export async function reorderSublistsInList(supabase, user, listId, orderedIds) {
    const validation = validateOrderedIds(orderedIds, [listId]);
    if (validation.failure) return validation.failure;

    const spaceId = await getSpaceIdForList(supabase, listId);
    if (!spaceId) return ROWS_NOT_FOUND_FAILURE;

    return reorderRowsInSpace(supabase, user, {
        table: 'sublists',
        creatorColumn: 'created_by',
        scopeColumn: 'list_id',
        scopeValue: listId,
        spaceId,
        orderedIds: validation.ids,
    });
}
