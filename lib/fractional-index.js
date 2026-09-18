/**
 * Computes a fractional position between two siblings for ordering.
 * Returns the midpoint between beforePosition and afterPosition.
 * - If afterPosition is null (inserting at the end), returns beforePosition + 1.
 * - If beforePosition is null (inserting at the start), returns afterPosition / 2.
 * - Both null means this is the first item, returns 1.
 *
 * @param {number|null} beforePosition - Position of the preceding sibling, or null
 * @param {number|null} afterPosition - Position of the following sibling, or null
 * @returns {number} New position value
 */
export function getPositionBetween(beforePosition, afterPosition) {
    if (beforePosition === null && afterPosition === null) return 1;
    if (beforePosition === null) return afterPosition / 2;
    if (afterPosition === null) return beforePosition + 1;
    return (beforePosition + afterPosition) / 2;
}

/**
 * Renormalizes sibling positions to integer values (1, 2, 3...) when any two
 * adjacent positions are within 0.001 of each other - preventing float precision loss.
 * Returns a new array with the same items but updated position values.
 *
 * @param {{ id: string, position: number }[]} siblings - Sorted array of siblings
 * @returns {{ id: string, position: number }[]} Array with renormalized positions
 */
export function rebalancePositions(siblings) {
    const sorted = [...siblings].sort((a, b) => a.position - b.position);

    const needsRebalance = sorted.some(
        (sibling, index) =>
            index > 0 && Math.abs(sibling.position - sorted[index - 1].position) < 0.001,
    );

    if (!needsRebalance) return siblings;

    // Renormalize to integer sequence starting at 1
    return sorted.map((sibling, index) => ({ ...sibling, position: index + 1 }));
}
