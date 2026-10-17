/**
 * Computes a fractional sort position between two siblings; a null or undefined neighbour means none on that side.
 *
 * @param {number|null|undefined} beforePosition - Position of the preceding sibling.
 * @param {number|null|undefined} afterPosition - Position of the following sibling.
 * @returns {number} Midpoint; last + 1 at the end, first / 2 at the start, 1 when both are missing.
 */
export function getPositionBetween(beforePosition, afterPosition) {
    // Optional chaining hands us undefined for a missing sibling, which would otherwise become NaN below
    const previousSiblingPosition = beforePosition ?? null;
    const nextSiblingPosition = afterPosition ?? null;

    if (previousSiblingPosition === null && nextSiblingPosition === null) return 1;
    if (previousSiblingPosition === null) return nextSiblingPosition / 2;
    if (nextSiblingPosition === null) return previousSiblingPosition + 1;
    return (previousSiblingPosition + nextSiblingPosition) / 2;
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
