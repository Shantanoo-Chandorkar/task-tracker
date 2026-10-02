import { describe, expect, it } from 'vitest';
import {
    PILL_SURFACE_COLORS,
    contrastRatio,
    mixColors,
    parseHexColor,
    readableTextColor,
} from './color-contrast';

const LIGHT_TEXT_TARGET = '#1c1917';
const DARK_TEXT_TARGET = '#fffaf5';
const SAMPLE_COLORS = [
    '#facc15',
    '#6b7280',
    '#3b82f6',
    '#f59e0b',
    '#a855f7',
    '#10b981',
    '#1e3a8a',
    '#ffffff',
];

describe('parseHexColor', () => {
    it('reads a #rrggbb colour', () => {
        expect(parseHexColor('#3b82f6')).toEqual([59, 130, 246]);
        expect(parseHexColor('#FFFFFF')).toEqual([255, 255, 255]);
    });

    it.each([
        'red',
        '#fff',
        '#12345g',
        '#3b82f6;}body{display:none',
        'url(javascript:alert(1))',
        'rgb(1,2,3)',
        '',
        null,
        undefined,
        42,
    ])('rejects %j', (notAColor) => {
        expect(parseHexColor(notAColor)).toBeNull();
    });
});

describe('contrastRatio', () => {
    it('is 21 for black on white and 1 for the same colour', () => {
        expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
        expect(contrastRatio('#737373', '#737373')).toBeCloseTo(1, 5);
    });

    it('gives the known ratio of the old muted text on the page', () => {
        expect(contrastRatio('#737373', '#fdfbf7')).toBeCloseTo(4.59, 1);
    });

    it('does not depend on which colour is first', () => {
        expect(contrastRatio('#c2410c', '#f2eee8')).toBeCloseTo(
            contrastRatio('#f2eee8', '#c2410c'),
            10,
        );
    });
});

describe('mixColors', () => {
    it('returns the base at 0, the top colour at 1 and the middle at half', () => {
        expect(mixColors('#ffffff', '#000000', 0)).toBe('#000000');
        expect(mixColors('#ffffff', '#000000', 1)).toBe('#ffffff');
        expect(mixColors('#ffffff', '#000000', 0.5)).toBe('#808080');
    });
});

describe('readableTextColor', () => {
    it.each(SAMPLE_COLORS)('makes %s readable on the light surfaces', (color) => {
        const textColor = readableTextColor({
            color,
            surfaces: PILL_SURFACE_COLORS.light,
            towardsColor: LIGHT_TEXT_TARGET,
        });

        for (const surface of PILL_SURFACE_COLORS.light) {
            expect(
                contrastRatio(textColor, mixColors(color, surface, 0.15)),
            ).toBeGreaterThanOrEqual(4.5);
        }
    });

    it.each(SAMPLE_COLORS)('makes %s readable on the dark surfaces', (color) => {
        const textColor = readableTextColor({
            color,
            surfaces: PILL_SURFACE_COLORS.dark,
            towardsColor: DARK_TEXT_TARGET,
        });

        for (const surface of PILL_SURFACE_COLORS.dark) {
            expect(
                contrastRatio(textColor, mixColors(color, surface, 0.15)),
            ).toBeGreaterThanOrEqual(4.5);
        }
    });

    it('keeps a colour that is already readable, and changes one that is not', () => {
        const light = { surfaces: PILL_SURFACE_COLORS.light, towardsColor: LIGHT_TEXT_TARGET };

        expect(readableTextColor({ color: '#1e3a8a', ...light })).toBe('#1e3a8a');
        expect(readableTextColor({ color: '#facc15', ...light })).not.toBe('#facc15');
    });

    it('stays close to the picked colour instead of jumping to black', () => {
        const darkened = readableTextColor({
            color: '#3b82f6',
            surfaces: PILL_SURFACE_COLORS.light,
            towardsColor: LIGHT_TEXT_TARGET,
        });

        expect(contrastRatio(darkened, '#3b82f6')).toBeLessThan(3);
    });

    it('returns null for anything that is not a plain hex colour', () => {
        expect(
            readableTextColor({
                color: 'red;background:url(x)',
                surfaces: PILL_SURFACE_COLORS.light,
                towardsColor: LIGHT_TEXT_TARGET,
            }),
        ).toBeNull();
    });
});
