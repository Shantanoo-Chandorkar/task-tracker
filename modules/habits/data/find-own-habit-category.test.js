import { describe, expect, it, vi } from 'vitest';
import { findOwnHabitCategoryById } from './find-own-habit-category';

/**
 * Fake Supabase client whose `habit_categories` select resolves to one row (or none).
 *
 * @param {object|null} category - Row `maybeSingle()` resolves to, or null for no visible row.
 * @returns {object} A `from`-only fake client.
 */
function makeSupabase(category) {
    const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({ data: category })),
    };
    return { from: vi.fn(() => query), query };
}

describe('findOwnHabitCategoryById', () => {
    it('returns the category when it is visible to the caller', async () => {
        const supabase = makeSupabase({ id: 'category-1' });

        expect(await findOwnHabitCategoryById(supabase, 'category-1')).toEqual({
            id: 'category-1',
        });
    });

    it('returns null when nothing is visible - unknown id or another user’s category alike', async () => {
        const supabase = makeSupabase(null);

        expect(await findOwnHabitCategoryById(supabase, 'category-missing')).toBeNull();
    });

    it('filters by the given id', async () => {
        const { from, query } = makeSupabase({ id: 'category-1' });

        await findOwnHabitCategoryById({ from }, 'category-1');

        expect(query.eq).toHaveBeenCalledWith('id', 'category-1');
    });
});
