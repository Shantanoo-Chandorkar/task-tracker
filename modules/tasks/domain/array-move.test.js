import { describe, expect, it } from 'vitest';
import { arrayMove } from './array-move';

function rows(...ids) {
    return ids.map((id) => ({ id }));
}

function ids(rowArray) {
    return rowArray.map((row) => row.id);
}

describe('arrayMove', () => {
    it('moves a row forward, shifting the rows between it and the target', () => {
        expect(ids(arrayMove(rows('a', 'b', 'c', 'd'), 0, 2))).toEqual(['b', 'c', 'a', 'd']);
    });

    it('moves a row backward, shifting the rows between it and the target', () => {
        expect(ids(arrayMove(rows('a', 'b', 'c', 'd'), 3, 1))).toEqual(['a', 'd', 'b', 'c']);
    });

    it('moving a row to its own index is a no-op', () => {
        expect(ids(arrayMove(rows('a', 'b', 'c'), 1, 1))).toEqual(['a', 'b', 'c']);
    });

    it('moves the first row to the last index', () => {
        expect(ids(arrayMove(rows('a', 'b', 'c'), 0, 2))).toEqual(['b', 'c', 'a']);
    });

    it('moves the last row to the first index', () => {
        expect(ids(arrayMove(rows('a', 'b', 'c'), 2, 0))).toEqual(['c', 'a', 'b']);
    });

    it('resolves a negative toIndex by counting back from the end', () => {
        expect(ids(arrayMove(rows('a', 'b', 'c', 'd'), 0, -1))).toEqual(['b', 'c', 'd', 'a']);
    });

    it('does nothing to a single-row array', () => {
        expect(ids(arrayMove(rows('a'), 0, 0))).toEqual(['a']);
    });

    it('does nothing to an empty array', () => {
        expect(arrayMove([], 0, 0)).toEqual([]);
    });

    it('never mutates the array passed in', () => {
        const original = rows('a', 'b', 'c');
        const originalIds = ids(original);

        arrayMove(original, 0, 2);

        expect(ids(original)).toEqual(originalIds);
    });

    it('returns a new array reference even for a same-index move', () => {
        const original = rows('a', 'b');

        expect(arrayMove(original, 0, 0)).not.toBe(original);
    });
});
