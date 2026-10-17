import { describe, expect, it } from 'vitest';
import { durationMeasure } from './duration';

// Canonical seconds (decision 14) - a 10-minute target is stored as 600.
const habit = { target_value: 600 };

describe('durationMeasure.isGoalMet', () => {
    it('is met once the logged seconds reach the target', () => {
        expect(durationMeasure.isGoalMet({ value: 600 }, habit)).toBe(true);
        expect(durationMeasure.isGoalMet({ value: 900 }, habit)).toBe(true);
    });

    it('is not met below the target', () => {
        expect(durationMeasure.isGoalMet({ value: 599 }, habit)).toBe(false);
    });

    it('is not met when no entry was logged', () => {
        expect(durationMeasure.isGoalMet(null, habit)).toBe(false);
    });
});

describe('durationMeasure.normalizeValue', () => {
    it('accepts zero and positive numbers', () => {
        expect(durationMeasure.normalizeValue(0)).toBe(0);
        expect(durationMeasure.normalizeValue(600)).toBe(600);
    });

    it.each([[-1], [undefined], [null], [NaN], ['abc'], [{}]])('rejects %j', (rawValue) => {
        expect(durationMeasure.normalizeValue(rawValue)).toBeNull();
    });
});
