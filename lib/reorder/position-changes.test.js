import { describe, expect, it } from 'vitest';
import { getPositionChanges } from './position-changes';

describe('getPositionChanges', () => {
    it('lists only the rows whose position changed, with the new position', () => {
        const orderedRows = [
            { id: 'b', position: 1 },
            { id: 'a', position: 0 },
            { id: 'c', position: 2 },
        ];

        expect(getPositionChanges(orderedRows)).toEqual([
            { id: 'b', position: 0 },
            { id: 'a', position: 1 },
        ]);
    });

    it('returns nothing when the order did not change', () => {
        expect(
            getPositionChanges([
                { id: 'a', position: 0 },
                { id: 'b', position: 1 },
            ]),
        ).toEqual([]);
    });

    it('writes every row when the saved positions are all different, such as after a gap', () => {
        const orderedRows = [
            { id: 'a', position: 5 },
            { id: 'b', position: 9 },
        ];

        expect(getPositionChanges(orderedRows)).toEqual([
            { id: 'a', position: 0 },
            { id: 'b', position: 1 },
        ]);
    });
});
