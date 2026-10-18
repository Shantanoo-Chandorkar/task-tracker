import { describe, expect, it, vi } from 'vitest';
import { findHabitEntryForDate } from './find-habit-entry-for-date';

/**
 * Fake Supabase client whose `habit_entries` select resolves to one row (or none).
 *
 * @param {object|null} entry - Row `maybeSingle()` resolves to, or null for no visible row.
 * @returns {object} A `from`-only fake client.
 */
function makeSupabase(entry) {
    const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({ data: entry })),
    };
    return { from: vi.fn(() => query), query };
}

describe('findHabitEntryForDate', () => {
    it('returns the entry when one exists for that day', async () => {
        const supabase = makeSupabase({ id: 'entry-1', local_date: '2026-10-18' });

        expect(await findHabitEntryForDate(supabase, 'habit-1', '2026-10-18')).toEqual({
            id: 'entry-1',
            local_date: '2026-10-18',
        });
    });

    it('returns null when no entry exists for that day', async () => {
        const supabase = makeSupabase(null);

        expect(await findHabitEntryForDate(supabase, 'habit-1', '2026-10-18')).toBeNull();
    });

    it('filters by both the habit id and the local date', async () => {
        const { from, query } = makeSupabase(null);

        await findHabitEntryForDate({ from }, 'habit-1', '2026-10-18');

        expect(query.eq).toHaveBeenCalledWith('habit_id', 'habit-1');
        expect(query.eq).toHaveBeenCalledWith('local_date', '2026-10-18');
    });
});
