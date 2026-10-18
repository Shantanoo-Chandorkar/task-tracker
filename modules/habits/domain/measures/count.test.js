import { describe, expect, it } from 'vitest';
import { countMeasure } from './count';

const habit = { target_value: 20 };

describe('countMeasure.isGoalMet', () => {
    it('is met once the count reaches the target', () => {
        expect(countMeasure.isGoalMet({ value: 20 }, habit)).toBe(true);
        expect(countMeasure.isGoalMet({ value: 25 }, habit)).toBe(true);
    });

    it('is not met below the target', () => {
        expect(countMeasure.isGoalMet({ value: 19 }, habit)).toBe(false);
    });

    it('is not met when no entry was logged', () => {
        expect(countMeasure.isGoalMet(null, habit)).toBe(false);
    });
});

describe('countMeasure.normalizeValue', () => {
    it('accepts zero and positive numbers', () => {
        expect(countMeasure.normalizeValue(0)).toBe(0);
        expect(countMeasure.normalizeValue(20)).toBe(20);
    });

    it('accepts a numeric string', () => {
        expect(countMeasure.normalizeValue('20')).toBe(20);
    });

    it.each([[-1], [undefined], [null], [NaN], ['abc'], [{}]])('rejects %j', (rawValue) => {
        expect(countMeasure.normalizeValue(rawValue)).toBeNull();
    });
});
