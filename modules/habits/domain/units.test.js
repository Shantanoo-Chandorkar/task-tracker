import { describe, expect, it } from 'vitest';
import {
    UNIT_CODES,
    UNIT_OPTIONS,
    isValidUnitCode,
    getUnitDimension,
    toCanonicalValue,
    fromCanonicalValue,
} from './units';

describe('isValidUnitCode', () => {
    it('accepts every listed unit code', () => {
        for (const unitCode of UNIT_CODES) {
            expect(isValidUnitCode(unitCode)).toBe(true);
        }
    });

    it.each([[undefined], [null], [42], ['parsecs'], ['']])('rejects %j', (value) => {
        expect(isValidUnitCode(value)).toBe(false);
    });
});

describe('UNIT_OPTIONS', () => {
    it('lists every unit code exactly once, each with its label and dimension', () => {
        expect(UNIT_OPTIONS).toHaveLength(UNIT_CODES.length);
        for (const unitCode of UNIT_CODES) {
            const option = UNIT_OPTIONS.find((candidate) => candidate.code === unitCode);
            expect(option.dimension).toBe(getUnitDimension(unitCode));
            expect(option.label).toBeTruthy();
        }
    });
});

describe('getUnitDimension', () => {
    it.each([
        ['km', 'distance'],
        ['mi', 'distance'],
        ['min', 'duration'],
    ])('%s belongs to %s', (unitCode, dimension) => {
        expect(getUnitDimension(unitCode)).toBe(dimension);
    });

    it('is null for an unknown unit code', () => {
        expect(getUnitDimension('parsecs')).toBeNull();
    });

    it('is null for a unit dropped in favour of the custom-unit fallback (decision B3.1)', () => {
        for (const droppedCode of ['m', 'g', 'kg', 'lb', 'ml', 'l', 'fl_oz']) {
            expect(getUnitDimension(droppedCode)).toBeNull();
        }
    });
});

describe('toCanonicalValue / fromCanonicalValue', () => {
    it('converts kilometres to metres and back', () => {
        expect(toCanonicalValue('km', 5)).toBe(5000);
        expect(fromCanonicalValue('km', 5000)).toBe(5);
    });

    it('converts minutes to seconds and back', () => {
        expect(toCanonicalValue('min', 10)).toBe(600);
        expect(fromCanonicalValue('min', 600)).toBe(10);
    });

    it('is a no-op for a unit that is already canonical', () => {
        expect(toCanonicalValue('sec', 42)).toBe(42);
        expect(fromCanonicalValue('sec', 42)).toBe(42);
    });

    it('is zero-value-safe', () => {
        expect(toCanonicalValue('km', 0)).toBe(0);
        expect(fromCanonicalValue('km', 0)).toBe(0);
    });

    it('throws for an unknown unit code', () => {
        expect(() => toCanonicalValue('parsecs', 1)).toThrow('Unknown unit code: parsecs');
        expect(() => fromCanonicalValue('parsecs', 1)).toThrow('Unknown unit code: parsecs');
    });
});
