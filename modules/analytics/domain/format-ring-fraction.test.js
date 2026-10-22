import { describe, expect, it } from 'vitest';
import { formatRingFraction } from './format-ring-fraction';

describe('formatRingFraction', () => {
    it('formats a completed-of-total sentence with the given noun', () => {
        expect(formatRingFraction(23, 30, 'days')).toBe('23 of 30 days completed');
    });

    it('uses the noun as given for a different unit of count', () => {
        expect(formatRingFraction(2, 3, 'due habits')).toBe('2 of 3 due habits completed');
    });

    it('does not crash on a zero total', () => {
        expect(formatRingFraction(0, 0, 'days')).toBe('0 of 0 days completed');
    });
});
