/**
 * Computes a fractional position between two siblings for ordering.
 * Returns the midpoint between a and b.
 * - If b is null (inserting at the end), returns a + 1.
 * - If a is null (inserting at the start), returns b / 2.
 * - Both null means this is the first item, returns 1.
 *
 * @param {number|null} a - Position of the preceding sibling, or null
 * @param {number|null} b - Position of the following sibling, or null
 * @returns {number} New position value
 */
export function getPositionBetween(a, b) {
    if (a === null && b === null) return 1;
    if (a === null) return b / 2;
    if (b === null) return a + 1;
    return (a + b) / 2;
}

/**
 * Renormalizes sibling positions to integer values (1, 2, 3...) when any two
 * adjacent positions are within 0.001 of each other — preventing float precision loss.
 * Returns a new array with the same items but updated position values.
 *
 * @param {{ id: string, position: number }[]} siblings - Sorted array of siblings
 * @returns {{ id: string, position: number }[]} Array with renormalized positions
 */
export function rebalancePositions(siblings) {
    const sorted = [...siblings].sort((a, b) => a.position - b.position);

    // Check if any adjacent pair is too close
    const needsRebalance = sorted.some(
        (item, index) => index > 0 && Math.abs(item.position - sorted[index - 1].position) < 0.001,
    );

    if (!needsRebalance) return siblings;

    // Renormalize to integer sequence starting at 1
    return sorted.map((item, index) => ({ ...item, position: index + 1 }));
}
