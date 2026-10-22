import { describe, expect, it } from 'vitest';
import { buildConicGradientStops } from './build-conic-gradient-stops';

describe('buildConicGradientStops', () => {
    it('returns no stops for an empty slice list', () => {
        expect(buildConicGradientStops([])).toEqual([]);
    });

    it('returns no stops when every slice is zero, instead of dividing by zero', () => {
        const slices = [
            { color: '#111111', seconds: 0 },
            { color: '#222222', seconds: 0 },
        ];

        expect(buildConicGradientStops(slices)).toEqual([]);
    });

    it('gives one slice the full 0-100% range', () => {
        const slices = [{ color: '#111111', seconds: 600 }];

        expect(buildConicGradientStops(slices)).toEqual([
            { color: '#111111', startPercent: 0, endPercent: 100 },
        ]);
    });

    it('splits two slices proportionally and makes each start where the last ended', () => {
        const slices = [
            { color: '#111111', seconds: 300 },
            { color: '#222222', seconds: 900 },
        ];

        expect(buildConicGradientStops(slices)).toEqual([
            { color: '#111111', startPercent: 0, endPercent: 25 },
            { color: '#222222', startPercent: 25, endPercent: 100 },
        ]);
    });
});
