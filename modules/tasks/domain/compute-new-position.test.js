import { describe, expect, it } from 'vitest';
import { computeNewPosition } from './compute-new-position';

const siblings = [
    { id: 'a', position: 1 },
    { id: 'b', position: 2 },
    { id: 'c', position: 4 },
];

describe('computeNewPosition', () => {
    it('puts the task before the first sibling when asked to prepend, ignoring the named sibling', () => {
        expect(computeNewPosition(siblings, 'b', true)).toBeLessThan(1);
    });

    it('appends after the last sibling when no sibling is named', () => {
        expect(computeNewPosition(siblings, null, false)).toBeGreaterThan(4);
    });

    it('appends after the last sibling when the named sibling is not among them', () => {
        expect(computeNewPosition(siblings, 'gone', false)).toBeGreaterThan(4);
    });

    it('lands strictly between the named sibling and the one after it', () => {
        const newPosition = computeNewPosition(siblings, 'a', false);

        expect(newPosition).toBeGreaterThan(1);
        expect(newPosition).toBeLessThan(2);
    });

    it('lands after the named sibling when it is the last one', () => {
        expect(computeNewPosition(siblings, 'c', false)).toBeGreaterThan(4);
    });

    it('works with no siblings at all', () => {
        expect(Number.isFinite(computeNewPosition([], null, false))).toBe(true);
        expect(Number.isFinite(computeNewPosition([], null, true))).toBe(true);
    });
});
