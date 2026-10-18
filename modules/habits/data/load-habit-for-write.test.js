import { describe, expect, it, vi } from 'vitest';
import { loadHabitForWrite } from './load-habit-for-write';

const NOT_FOUND_FAILURE = { error: 'Habit not found', code: 'HABIT_NOT_FOUND' };

/**
 * Fake Supabase client whose `habits` select resolves to one row (or none).
 *
 * @param {object|null} habit - Row `maybeSingle()` resolves to, or null for no visible row.
 * @returns {object} A `from`-only fake client, plus the `eq` spy for assertions.
 */
function makeSupabase(habit) {
    const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({ data: habit })),
    };
    return { from: vi.fn(() => query), query };
}

describe('loadHabitForWrite', () => {
    it('returns the habit when it is visible to the caller', async () => {
        const habit = { id: 'habit-1', title: 'Read' };
        const supabase = makeSupabase(habit);

        expect(await loadHabitForWrite(supabase, 'habit-1', NOT_FOUND_FAILURE)).toEqual({
            habit,
            failure: null,
        });
    });

    it('returns the not-found failure when nothing is visible - unknown id or another user’s row alike', async () => {
        const supabase = makeSupabase(null);

        expect(await loadHabitForWrite(supabase, 'habit-missing', NOT_FOUND_FAILURE)).toEqual({
            habit: null,
            failure: NOT_FOUND_FAILURE,
        });
    });

    it('filters by the given id', async () => {
        const { from, query } = makeSupabase({ id: 'habit-1' });

        await loadHabitForWrite({ from }, 'habit-1', NOT_FOUND_FAILURE);

        expect(query.eq).toHaveBeenCalledWith('id', 'habit-1');
    });
});
