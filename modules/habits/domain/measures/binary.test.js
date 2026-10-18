import { describe, expect, it } from 'vitest';
import { binaryMeasure } from './binary';

describe('binaryMeasure.isGoalMet', () => {
    it('is met when an entry was logged', () => {
        expect(binaryMeasure.isGoalMet({ value: 1 })).toBe(true);
    });

    it('is not met when no entry was logged', () => {
        expect(binaryMeasure.isGoalMet(null)).toBe(false);
    });
});

describe('binaryMeasure.normalizeValue', () => {
    it.each([[undefined], [null], [true], [1]])('normalizes %j to 1', (rawValue) => {
        expect(binaryMeasure.normalizeValue(rawValue)).toBe(1);
    });

    it.each([[false], [0], [2], ['yes'], [{}]])('rejects %j', (rawValue) => {
        expect(binaryMeasure.normalizeValue(rawValue)).toBeNull();
    });
});
