import { isDueOn, isHabitDaySuccessful, isLocalDateBefore, localDateRange } from '@/modules/habits';
import { groupEntriesByHabitId } from './group-by';

/**
 * Walks every (day, due daily/weekdays/every_n_days habit) pair in a period and reports whether
 * it was successful - the shared basis for the heatmap and day-of-week KPIs, so the due-ness and
 * success rules can never drift apart between them.
 *
 * @param {Array<Record<string, any>>} habits - Habit rows in scope; `times_per_week` habits are
 *   skipped - they have no single due day (see `consistency-heatmap.js`).
 * @param {Array<Record<string, any>>} entries - `habit_entries` rows in scope, any habits.
 * @param {{ start: string, end: string }} period - Inclusive local-date window.
 * @returns {Array<{ localDate: string, habitId: string, isSuccessful: boolean }>} One entry per
 *   due day per habit, in no particular order.
 */
export function listDailyHabitOutcomes(habits, entries, period) {
    const entriesByHabitId = groupEntriesByHabitId(entries);
    const dailyHabits = habits.filter((habit) => habit.recurrence.kind !== 'times_per_week');
    /** @type {Map<string, Map<string, Record<string, any>>>} */
    const entriesByDateByHabitId = new Map(
        dailyHabits.map((habit) => [
            habit.id,
            new Map(
                (entriesByHabitId.get(habit.id) ?? []).map((entry) => [entry.local_date, entry]),
            ),
        ]),
    );

    /** @type {Array<{ localDate: string, habitId: string, isSuccessful: boolean }>} */
    const outcomes = [];
    for (const localDate of localDateRange(period.start, period.end)) {
        for (const habit of dailyHabits) {
            if (isLocalDateBefore(localDate, habit.started_on)) continue;
            if (!isDueOn(habit.recurrence, localDate)) continue;
            const entriesByDate = entriesByDateByHabitId.get(habit.id) ?? new Map();
            outcomes.push({
                localDate,
                habitId: habit.id,
                isSuccessful: isHabitDaySuccessful(habit, entriesByDate, localDate),
            });
        }
    }
    return outcomes;
}
