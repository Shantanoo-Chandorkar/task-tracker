import { describe, expect, it, vi } from 'vitest';
import { getNextPosition } from './append-position';

/**
 * Chainable fake Supabase query - every filter method returns itself, and awaiting it
 * resolves to `{ data }`, matching how getNextPosition awaits the query object directly.
 *
 * @param {object[]} rows - Rows the query resolves to
 * @returns {object} A chainable, awaitable fake query with a `from` spy that returns it
 */
function makeSupabase(rows) {
    const query = {
        select: vi.fn(() => query),
        order: vi.fn(() => query),
        limit: vi.fn(() => query),
        eq: vi.fn(() => query),
        is: vi.fn(() => query),
        then: (resolve) => resolve({ data: rows }),
    };
    return { from: vi.fn(() => query), query };
}

describe('getNextPosition', () => {
    it('returns the default emptyValue (0) when there are no existing siblings', async () => {
        const { from } = makeSupabase([]);
        const nextPosition = await getNextPosition({ from }, 'habits', { user_id: 'user-1' });
        expect(nextPosition).toBe(0);
    });

    it('returns the given emptyValue when there are no existing siblings', async () => {
        const { from } = makeSupabase([]);
        const nextPosition = await getNextPosition(
            { from },
            'habit_categories',
            { user_id: 'user-1' },
            1,
        );
        expect(nextPosition).toBe(1);
    });

    it('returns one past the highest existing position', async () => {
        const { from } = makeSupabase([{ position: 4 }]);
        const nextPosition = await getNextPosition({ from }, 'habits', { user_id: 'user-1' });
        expect(nextPosition).toBe(5);
    });

    it('scopes the query to the given table', async () => {
        const { from } = makeSupabase([]);
        await getNextPosition({ from }, 'habit_categories', { user_id: 'user-1' });
        expect(from).toHaveBeenCalledWith('habit_categories');
    });

    it('filters a null-valued column with .is(), not .eq()', async () => {
        const { from, query } = makeSupabase([]);
        await getNextPosition({ from }, 'habits', { category_id: null, user_id: 'user-1' });
        expect(query.is).toHaveBeenCalledWith('category_id', null);
        expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
        expect(query.eq).not.toHaveBeenCalledWith('category_id', null);
    });
});
