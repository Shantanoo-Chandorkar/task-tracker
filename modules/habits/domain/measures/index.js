import { binaryMeasure } from './binary';
import { countMeasure } from './count';
import { quantityMeasure } from './quantity';
import { durationMeasure } from './duration';

export const MEASURE_KINDS = ['binary', 'count', 'quantity', 'duration'];

/** @type {Record<string, { isGoalMet: Function, normalizeValue: Function }>} */
const MEASURE_BY_KIND = {
    binary: binaryMeasure,
    count: countMeasure,
    quantity: quantityMeasure,
    duration: durationMeasure,
};

/**
 * Looks up the strategy implementation for a habit's measure kind.
 *
 * @param {string} measureKind - One of MEASURE_KINDS.
 * @returns {{ isGoalMet: Function, normalizeValue: Function }} The measure's implementation.
 * @throws {Error} If `measureKind` is not recognised.
 */
export function getMeasure(measureKind) {
    const measure = MEASURE_BY_KIND[measureKind];
    if (!measure) throw new Error(`Unknown measure kind: ${measureKind}`);
    return measure;
}
