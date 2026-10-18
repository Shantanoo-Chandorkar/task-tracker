/**
 * Looks up a habit's check-in for one local date, so a toggle action knows insert vs. delete.
 *
 * @param {SupabaseClient} supabase - Request-scoped Supabase client.
 * @param {string} habitId - Habit the entry belongs to.
 * @param {string} localDate - 'YYYY-MM-DD' day to look up.
 * @returns {Promise<Record<string, any>|null>} The entry, or null when none exists for that day.
 */
export async function findHabitEntryForDate(supabase, habitId, localDate) {
    const { data: entry } = await supabase
        .from('habit_entries')
        .select('*')
        .eq('habit_id', habitId)
        .eq('local_date', localDate)
        .maybeSingle();
    return entry ?? null;
}
