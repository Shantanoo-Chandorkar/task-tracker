import { describe, expect, it } from 'vitest';
import { getMeasure, MEASURE_KINDS } from './index';
import { binaryMeasure } from './binary';
import { countMeasure } from './count';
import { quantityMeasure } from './quantity';
import { durationMeasure } from './duration';

describe('MEASURE_KINDS', () => {
    it('lists exactly the four supported measures', () => {
        expect(MEASURE_KINDS).toEqual(['binary', 'count', 'quantity', 'duration']);
    });
});

describe('getMeasure', () => {
    it.each([
        ['binary', binaryMeasure],
        ['count', countMeasure],
        ['quantity', quantityMeasure],
        ['duration', durationMeasure],
    ])('returns the %s strategy', (measureKind, expectedMeasure) => {
        expect(getMeasure(measureKind)).toBe(expectedMeasure);
    });

    it('throws for an unrecognised measure kind', () => {
        expect(() => getMeasure('bogus')).toThrow('Unknown measure kind: bogus');
    });
});
