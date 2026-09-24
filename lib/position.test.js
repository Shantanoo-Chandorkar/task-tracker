import { describe, expect, it, vi } from 'vitest';
import { getNextPosition } from './position';

/**
 * Chainable fake Supabase query - every filter method returns itself, and awaiting it
 * resolves to `{ data }`, matching how getNextPosition awaits the query object directly.
 *
 * @param {object[]} data - Rows the query resolves to
 * @returns {object} A chainable, awaitable fake query with a `from` spy that returns it
 */
function makeSupabase(data) {
    const query = {
        select: vi.fn(() => query),
        order: vi.fn(() => query),
        limit: vi.fn(() => query),
        eq: vi.fn(() => query),
        is: vi.fn(() => query),
        then: (resolve) => resolve({ data }),
    };
    return { from: vi.fn(() => query), query };
}

describe('getNextPosition', () => {
    it('returns the default emptyValue (0) when there are no existing siblings', async () => {
        const { from } = makeSupabase([]);
        const result = await getNextPosition({ from }, 'lists', { space_id: 'space-1' });
        expect(result).toBe(0);
    });

    it('returns the given emptyValue when there are no existing siblings', async () => {
        const { from } = makeSupabase([]);
        const result = await getNextPosition({ from }, 'tasks', { parent_id: 'task-1' }, 1);
        expect(result).toBe(1);
    });

    it('returns one past the highest existing position', async () => {
        const { from } = makeSupabase([{ position: 4 }]);
        const result = await getNextPosition({ from }, 'lists', { space_id: 'space-1' });
        expect(result).toBe(5);
    });

    it('scopes the query to the given table', async () => {
        const { from } = makeSupabase([]);
        await getNextPosition({ from }, 'sublists', { list_id: 'list-1' });
        expect(from).toHaveBeenCalledWith('sublists');
    });

    it('filters a null-valued column with .is(), not .eq()', async () => {
        const { from, query } = makeSupabase([]);
        await getNextPosition({ from }, 'tasks', { parent_id: null, list_id: 'list-1' });
        expect(query.is).toHaveBeenCalledWith('parent_id', null);
        expect(query.eq).toHaveBeenCalledWith('list_id', 'list-1');
        expect(query.eq).not.toHaveBeenCalledWith('parent_id', null);
    });
});
