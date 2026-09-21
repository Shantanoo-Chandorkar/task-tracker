import { describe, expect, it } from 'vitest';
import { hexToRgba } from './color';

describe('hexToRgba', () => {
    it('converts a 6-digit hex', () => {
        expect(hexToRgba('#f97316', 0.5)).toBe('rgba(249, 115, 22, 0.5)');
    });

    it('converts a 3-digit hex', () => {
        expect(hexToRgba('#fff', 1)).toBe('rgba(255, 255, 255, 1)');
    });

    it('throws on invalid hex', () => {
        expect(() => hexToRgba('#zzzzzz', 1)).toThrow();
        expect(() => hexToRgba('#12345', 1)).toThrow();
    });

    it('accepts a hex without the leading # and in upper case', () => {
        expect(hexToRgba('F97316', 1)).toBe('rgba(249, 115, 22, 1)');
    });

    it('throws for an empty string and for the wrong number of digits', () => {
        expect(() => hexToRgba('', 1)).toThrow('Invalid hex color');
        expect(() => hexToRgba('#12', 1)).toThrow('Invalid hex color');
        expect(() => hexToRgba('#1234567', 1)).toThrow('Invalid hex color');
    });

    it('throws when a short hex contains a non-hex character', () => {
        expect(() => hexToRgba('#1g3', 1)).toThrow('Invalid hex color');
    });

    it('throws when a trailing digit pair is only partly hex', () => {
        expect(() => hexToRgba('#12345g', 1)).toThrow('Invalid hex color');
    });
});
