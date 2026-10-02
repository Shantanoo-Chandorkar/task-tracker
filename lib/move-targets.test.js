import { describe, expect, it } from 'vitest';
import { getMoveTargets } from './move-targets';

const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('getMoveTargets', () => {
    it('gives both neighbours for a row in the middle', () => {
        expect(getMoveTargets(rows, 'b')).toEqual({ previousId: 'a', nextId: 'c' });
    });

    it('has nothing above the first row', () => {
        expect(getMoveTargets(rows, 'a')).toEqual({ previousId: null, nextId: 'b' });
    });

    it('has nothing below the last row', () => {
        expect(getMoveTargets(rows, 'c')).toEqual({ previousId: 'b', nextId: null });
    });

    it('has no neighbours for a lone row', () => {
        expect(getMoveTargets([{ id: 'a' }], 'a')).toEqual({ previousId: null, nextId: null });
    });

    it('has no neighbours when the row is not in the list, so a stale row cannot move', () => {
        expect(getMoveTargets(rows, 'missing')).toEqual({ previousId: null, nextId: null });
    });

    it('treats a missing list like an empty one', () => {
        expect(getMoveTargets(undefined, 'a')).toEqual({ previousId: null, nextId: null });
    });

    it('refuses a neighbour the caller says it cannot swap with', () => {
        const canSwap = (row, neighbour) => row.group === neighbour.group;
        const grouped = [
            { id: 'a', group: 1 },
            { id: 'b', group: 1 },
            { id: 'c', group: 2 },
        ];

        expect(getMoveTargets(grouped, 'b', canSwap)).toEqual({ previousId: 'a', nextId: null });
    });
});
