import { describe, expect, it } from 'vitest';
import { MAX_REORDER_ROWS, validateOrderedIds } from './validate-ordered-ids';

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const INVALID = {
    failure: { error: 'The new order is not valid', code: 'REORDER_INVALID_REQUEST' },
};

describe('validateOrderedIds', () => {
    it('accepts a list of distinct real ids and returns it unchanged', () => {
        expect(validateOrderedIds([ID_A, ID_B])).toEqual({ ids: [ID_A, ID_B] });
    });

    it.each([
        ['not a list', 'abc'],
        ['missing', undefined],
        ['empty', []],
        ['holding a non-id', [ID_A, 'not-a-uuid']],
        ['holding a non-string', [ID_A, 42]],
        ['repeating an id', [ID_A, ID_A]],
    ])('refuses ids that are %s', (_reason, orderedIds) => {
        expect(validateOrderedIds(orderedIds)).toEqual(INVALID);
    });

    it('refuses more ids than the cap', () => {
        const tooMany = Array.from(
            { length: MAX_REORDER_ROWS + 1 },
            (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        );

        expect(validateOrderedIds(tooMany)).toEqual(INVALID);
    });

    it('accepts exactly the cap', () => {
        const atCap = Array.from(
            { length: MAX_REORDER_ROWS },
            (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        );

        expect(validateOrderedIds(atCap).ids).toHaveLength(MAX_REORDER_ROWS);
    });

    it('checks the parent ids too', () => {
        expect(validateOrderedIds([ID_A], [ID_B])).toEqual({ ids: [ID_A] });
        expect(validateOrderedIds([ID_A], ['space-1'])).toEqual(INVALID);
        expect(validateOrderedIds([ID_A], [undefined])).toEqual(INVALID);
    });
});
