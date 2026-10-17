import { describe, expect, it } from 'vitest';
import { replaceRowsInPlace } from './replace-rows-in-place';

const idsOf = (rows) => rows.map((row) => row.id);

describe('replaceRowsInPlace', () => {
    it('refills the slots of the group in the new order and leaves other rows where they are', () => {
        const cachedRows = [{ id: 'x1' }, { id: 'a' }, { id: 'x2' }, { id: 'b' }];

        const replacedRows = replaceRowsInPlace(cachedRows, [{ id: 'b' }, { id: 'a' }]);

        expect(idsOf(replacedRows)).toEqual(['x1', 'b', 'x2', 'a']);
    });

    it('keeps the fields of the reordered rows, not the old cached ones', () => {
        const replacedRows = replaceRowsInPlace(
            [
                { id: 'a', name: 'old' },
                { id: 'b', name: 'old' },
            ],
            [
                { id: 'b', name: 'new' },
                { id: 'a', name: 'new' },
            ],
        );

        expect(replacedRows).toEqual([
            { id: 'b', name: 'new' },
            { id: 'a', name: 'new' },
        ]);
    });

    it('returns undefined when nothing is cached yet', () => {
        expect(replaceRowsInPlace(undefined, [{ id: 'a' }])).toBeUndefined();
    });

    it('ignores a reordered row that the cache no longer holds', () => {
        const replacedRows = replaceRowsInPlace(
            [{ id: 'a' }, { id: 'b' }],
            [{ id: 'gone' }, { id: 'b' }, { id: 'a' }],
        );

        expect(idsOf(replacedRows)).toEqual(['b', 'a']);
    });

    it('does not change the cached array it was given', () => {
        const cachedRows = [{ id: 'a' }, { id: 'b' }];

        replaceRowsInPlace(cachedRows, [{ id: 'b' }, { id: 'a' }]);

        expect(idsOf(cachedRows)).toEqual(['a', 'b']);
    });
});
