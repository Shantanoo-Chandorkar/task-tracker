import { describe, expect, it } from 'vitest';
import { quantityMeasure } from './quantity';

// target_value and entry values are canonical (decision 14) - e.g. a 2 l target is stored as 2000 (ml).
const habit = { target_value: 2000 };

describe('quantityMeasure.isGoalMet', () => {
    it('is met once the canonical amount reaches the target', () => {
        expect(quantityMeasure.isGoalMet({ value: 2000 }, habit)).toBe(true);
        expect(quantityMeasure.isGoalMet({ value: 2500 }, habit)).toBe(true);
    });

    it('is not met below the target', () => {
        expect(quantityMeasure.isGoalMet({ value: 1999 }, habit)).toBe(false);
    });

    it('is not met when no entry was logged', () => {
        expect(quantityMeasure.isGoalMet(null, habit)).toBe(false);
    });
});

describe('quantityMeasure.normalizeValue', () => {
    it('accepts zero and positive numbers', () => {
        expect(quantityMeasure.normalizeValue(0)).toBe(0);
        expect(quantityMeasure.normalizeValue(2000)).toBe(2000);
    });

    it.each([[-1], [undefined], [null], [NaN], ['abc'], [{}]])('rejects %j', (rawValue) => {
        expect(quantityMeasure.normalizeValue(rawValue)).toBeNull();
    });
});
