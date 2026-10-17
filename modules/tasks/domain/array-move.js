/**
 * Moves one array element to another index, shifting the rows between the two positions.
 *
 * Inlined from `@dnd-kit/sortable`'s `arrayMove` so the reorder engine has no drag dependency.
 * A negative `toIndex` counts from the end, matching the original.
 *
 * @param {object[]} rows - Rows in their current order.
 * @param {number} fromIndex - Index of the row to move.
 * @param {number} toIndex - Index the row should end up at.
 * @returns {object[]} A new array with the row moved; the input is never mutated.
 */
export function arrayMove(rows, fromIndex, toIndex) {
    const reordered = rows.slice();
    // A missing fromIndex has nothing to move; splicing it in anyway would insert `undefined`
    if (fromIndex < 0 || fromIndex >= reordered.length) return reordered;

    const resolvedToIndex = toIndex < 0 ? reordered.length + toIndex : toIndex;
    reordered.splice(resolvedToIndex, 0, reordered.splice(fromIndex, 1)[0]);
    return reordered;
}
