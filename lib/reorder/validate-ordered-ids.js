import { isUuid } from '@/lib/validation';
import { REORDER_INVALID_REQUEST } from '@/lib/error-codes';

// Far above what one space, list or sublist holds; it only stops a huge request from fanning out into updates.
export const MAX_REORDER_ROWS = 500;

const INVALID_ORDER_FAILURE = {
    error: 'The new order is not valid',
    code: REORDER_INVALID_REQUEST,
};

/**
 * Checks the client's list of row ids before it is trusted: real ids, no repeats, a sane size.
 *
 * @param {unknown} orderedIds - Ids in the order the client wants them
 * @param {unknown[]} [scopeIds] - Ids of the parent the rows belong to (space or list), each checked too
 * @returns {{ ids: string[] }|{ failure: { error: string, code: string } }} The ids, or the failure to return
 */
export function validateOrderedIds(orderedIds, scopeIds = []) {
    const isValid =
        Array.isArray(orderedIds) &&
        orderedIds.length > 0 &&
        orderedIds.length <= MAX_REORDER_ROWS &&
        orderedIds.every(isUuid) &&
        new Set(orderedIds).size === orderedIds.length &&
        scopeIds.every(isUuid);
    return isValid ? { ids: orderedIds } : { failure: INVALID_ORDER_FAILURE };
}
