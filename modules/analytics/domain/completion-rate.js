import { computeCompletionCounts } from '@/modules/habits';
import { groupEntriesByHabitId } from './group-by';

/**
 * Completion rate (completed / due) over a period, per habit and overall - decision 19's KPI 1.
 *
 * @param {Array<Record<string, any>>} habits - Habit rows in scope.
 * @param {Array<Record<string, any>>} entries - `habit_entries` rows in scope, any habits.
 * @param {{ start: string, end: string }} period - Inclusive local-date window.
 * @returns {{ byHabit: Array<{ habitId: string, dueCount: number, completedCount: number,
 *   completionRate: number|null }>, overall: { dueCount: number, completedCount: number,
 *   completionRate: number|null } }} Per-habit and aggregate counts. `completionRate` is `null`,
 *   not `0`, when nothing was due yet - so "no due days" is never shown as "0% success".
 */
export function computeCompletionRate(habits, entries, period) {
    const entriesByHabitId = groupEntriesByHabitId(entries);

    const byHabit = habits.map((habit) => {
        const { dueCount, completedCount } = computeCompletionCounts(
            habit,
            entriesByHabitId.get(habit.id) ?? [],
            period,
        );
        return {
            habitId: habit.id,
            dueCount,
            completedCount,
            completionRate: dueCount === 0 ? null : completedCount / dueCount,
        };
    });

    const totals = byHabit.reduce(
        (accumulated, habitCounts) => ({
            dueCount: accumulated.dueCount + habitCounts.dueCount,
            completedCount: accumulated.completedCount + habitCounts.completedCount,
        }),
        { dueCount: 0, completedCount: 0 },
    );

    return {
        byHabit,
        overall: {
            ...totals,
            completionRate: totals.dueCount === 0 ? null : totals.completedCount / totals.dueCount,
        },
    };
}
