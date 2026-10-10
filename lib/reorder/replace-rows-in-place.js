/**
 * Puts a reordered group of rows back into a cached array, filling the slots the group already held.
 *
 * Reads the cache as it is now, so a reorder in another group that finished first is not undone.
 *
 * @param {object[]|undefined} cachedRows - Rows currently cached, undefined if the query never loaded
 * @param {{ id: string }[]} reorderedRows - One group of rows in their new order
 * @returns {object[]|undefined} The cached rows with the group in its new order and every other row where it was
 */
export function replaceRowsInPlace(cachedRows, reorderedRows) {
    if (!cachedRows) return cachedRows;

    const cachedIds = new Set(cachedRows.map((row) => row.id));
    const groupRows = reorderedRows.filter((row) => cachedIds.has(row.id));
    const groupIds = new Set(groupRows.map((row) => row.id));
    let nextGroupRow = 0;
    return cachedRows.map((row) => (groupIds.has(row.id) ? groupRows[nextGroupRow++] : row));
}
