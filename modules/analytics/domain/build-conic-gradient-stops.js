/**
 * Proportional CSS `conic-gradient` stops for a set of colored slices, sized by their own share
 * of the total - shared so a second grouping of the same KPI never has to re-derive the math.
 *
 * @param {Array<{ color: string, seconds: number }>} slices - Non-zero slices, in display order.
 * @returns {Array<{ color: string, startPercent: number, endPercent: number }>} Cumulative
 *   percent ranges summing to 100, or `[]` when the total is zero.
 */
export function buildConicGradientStops(slices) {
    const totalSeconds = slices.reduce((sum, slice) => sum + slice.seconds, 0);
    if (totalSeconds === 0) return [];

    let cumulativePercent = 0;
    return slices.map((slice) => {
        const startPercent = cumulativePercent;
        cumulativePercent += (slice.seconds / totalSeconds) * 100;
        return { color: slice.color, startPercent, endPercent: cumulativePercent };
    });
}
