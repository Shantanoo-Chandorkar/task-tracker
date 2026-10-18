/**
 * Lists the rows whose saved position no longer matches their place in the new order.
 *
 * @param {{ id: string, position: number }[]} orderedRows - Rows in their new order; the index is the new position
 * @returns {{ id: string, position: number }[]} One entry per row that has to be written, with its new position
 */
export function getPositionChanges(orderedRows) {
    return orderedRows
        .map((row, newPosition) => ({
            id: row.id,
            position: newPosition,
            savedPosition: row.position,
        }))
        .filter(({ position, savedPosition }) => savedPosition !== position)
        .map(({ id, position }) => ({ id, position }));
}
