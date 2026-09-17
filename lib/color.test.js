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
});
