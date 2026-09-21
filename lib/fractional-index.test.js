import { describe, expect, it } from 'vitest';
import { getPositionBetween, rebalancePositions } from './fractional-index';

describe('getPositionBetween', () => {
    it('returns 1 for the first item in an empty list', () => {
        expect(getPositionBetween(null, null)).toBe(1);
    });

    it('halves the next position when inserting at the start', () => {
        expect(getPositionBetween(null, 4)).toBe(2);
    });

    it('adds 1 to the previous position when inserting at the end', () => {
        expect(getPositionBetween(3, null)).toBe(4);
    });

    it('returns the midpoint between two neighbours', () => {
        expect(getPositionBetween(1, 2)).toBe(1.5);
    });

    it('treats a previous position of 0 as a real position, not as missing', () => {
        expect(getPositionBetween(0, null)).toBe(1);
    });

    it('treats an undefined neighbour position like a missing one instead of returning NaN', () => {
        expect(getPositionBetween(undefined, 4)).toBe(2);
        expect(getPositionBetween(3, undefined)).toBe(4);
        expect(getPositionBetween(undefined, undefined)).toBe(1);
    });
});

describe('rebalancePositions', () => {
    it('returns an empty array for an empty list', () => {
        expect(rebalancePositions([])).toEqual([]);
    });

    it('leaves a single item untouched', () => {
        const singleSibling = [{ id: 'a', position: 0.0001 }];
        expect(rebalancePositions(singleSibling)).toBe(singleSibling);
    });

    it('returns the same array when positions are well spaced', () => {
        const wellSpacedSiblings = [
            { id: 'a', position: 1 },
            { id: 'b', position: 2 },
        ];
        expect(rebalancePositions(wellSpacedSiblings)).toBe(wellSpacedSiblings);
    });

    it('renumbers to 1..n in sorted order when two positions are nearly equal', () => {
        const collidingSiblings = [
            { id: 'a', position: 1 },
            { id: 'b', position: 1.0005 },
            { id: 'c', position: 5 },
        ];
        expect(rebalancePositions(collidingSiblings)).toEqual([
            { id: 'a', position: 1 },
            { id: 'b', position: 2 },
            { id: 'c', position: 3 },
        ]);
    });

    it('sorts unsorted input before renumbering', () => {
        const unsortedCollidingSiblings = [
            { id: 'c', position: 9 },
            { id: 'a', position: 1 },
            { id: 'b', position: 1.0001 },
        ];
        expect(rebalancePositions(unsortedCollidingSiblings).map((sibling) => sibling.id)).toEqual(['a', 'b', 'c']);
    });

    it('separates two siblings with identical positions', () => {
        const duplicatePositionSiblings = [
            { id: 'a', position: 2 },
            { id: 'b', position: 2 },
        ];
        const rebalancedPositions = rebalancePositions(duplicatePositionSiblings).map((sibling) => sibling.position);
        expect(new Set(rebalancedPositions).size).toBe(2);
    });

    it('does not mutate the input array or its items', () => {
        const collidingSiblings = [
            { id: 'a', position: 1 },
            { id: 'b', position: 1.0001 },
        ];
        rebalancePositions(collidingSiblings);
        expect(collidingSiblings).toEqual([
            { id: 'a', position: 1 },
            { id: 'b', position: 1.0001 },
        ]);
    });
});
