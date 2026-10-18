import { localDateRange } from '@/modules/habits';
import { listDailyHabitOutcomes } from './daily-habit-outcomes';

/**
 * Builds a calendar-grid consistency heatmap, aggregated across the given habits - decision 19's
 * KPI 3. `times_per_week` habits are excluded: a daily cell can't represent a weekly target.
 *
 * @param {Array<Record<string, any>>} habits - Habit rows in scope.
 * @param {Array<Record<string, any>>} entries - `habit_entries` rows in scope, any habits.
 * @param {{ start: string, end: string }} period - Inclusive local-date window.
 * @returns {Array<{ localDate: string, dueCount: number, successCount: number,
 *   completionRate: number|null }>} One row per calendar day in the period, ascending.
 */
export function computeConsistencyHeatmap(habits, entries, period) {
    const outcomes = listDailyHabitOutcomes(habits, entries, period);

    /** @type {Map<string, { dueCount: number, successCount: number }>} */
    const countsByDate = new Map();
    for (const outcome of outcomes) {
        const counts = countsByDate.get(outcome.localDate) ?? { dueCount: 0, successCount: 0 };
        counts.dueCount += 1;
        if (outcome.isSuccessful) counts.successCount += 1;
        countsByDate.set(outcome.localDate, counts);
    }

    return localDateRange(period.start, period.end).map((localDate) => {
        const { dueCount, successCount } = countsByDate.get(localDate) ?? {
            dueCount: 0,
            successCount: 0,
        };
        return {
            localDate,
            dueCount,
            successCount,
            completionRate: dueCount === 0 ? null : successCount / dueCount,
        };
    });
}
