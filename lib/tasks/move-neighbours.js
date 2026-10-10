/**
 * Finds the rows directly above and below one row, for "Move up" and "Move down".
 *
 * @param {{ id: string }[]|undefined} siblingRows - Rows in the order they are shown, all in the same sortable list.
 * @param {string} rowId - Id of the row that would move.
 * @param {(row: object, neighbourRow: object) => boolean} [canSwap] - Return false to refuse a neighbour.
 * @returns {{ previousId: string|null, nextId: string|null }} Neighbour ids, null where the row cannot move that way.
 */
export function getMoveTargets(siblingRows, rowId, canSwap = () => true) {
    const rows = siblingRows ?? [];
    const rowIndex = rows.findIndex((row) => row.id === rowId);
    if (rowIndex === -1) return { previousId: null, nextId: null };

    const row = rows[rowIndex];
    const previousRow = rows[rowIndex - 1];
    const nextRow = rows[rowIndex + 1];
    return {
        previousId: previousRow && canSwap(row, previousRow) ? previousRow.id : null,
        nextId: nextRow && canSwap(row, nextRow) ? nextRow.id : null,
    };
}
