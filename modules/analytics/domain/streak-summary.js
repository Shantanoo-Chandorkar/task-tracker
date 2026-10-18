import { computeStreaks } from '@/modules/habits';
import { groupEntriesByHabitId } from './group-by';

/**
 * Current and longest streak per habit - decision 19's KPI 2.
 *
 * @param {Array<Record<string, any>>} habits - Habit rows in scope.
 * @param {Array<Record<string, any>>} entries - `habit_entries` rows in scope, any habits.
 * @param {{ start: string, end: string }} period - `period.end` is the reference "today" for the
 *   streak's grace-period logic (correct for the normal "as of now" case).
 * @returns {Array<{ habitId: string, currentStreak: number, longestStreak: number }>}
 */
export function computeStreakSummary(habits, entries, period) {
    const entriesByHabitId = groupEntriesByHabitId(entries);

    return habits.map((habit) => {
        const { currentStreak, longestStreak } = computeStreaks(
            habit,
            entriesByHabitId.get(habit.id) ?? [],
            period.end,
        );
        return { habitId: habit.id, currentStreak, longestStreak };
    });
}
