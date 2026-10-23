import { computeElapsedSeconds } from '@/modules/timer';
import { groupSessionsByHabitId } from './group-by';

/**
 * Total tracked time per duration habit and per category - decision 19's KPI 5, the only one
 * that needs the Timer module. Reuses `computeElapsedSeconds` (decision 11's canonical formula)
 * rather than re-deriving it, so a currently-running session's live time counts correctly too.
 *
 * @param {Array<Record<string, any>>} habits - Habit rows in scope; only `measure_kind ===
 *   'duration'` habits are included.
 * @param {Array<Record<string, any>>} sessions - `time_sessions` rows in scope, any subject; only
 *   habit-linked ones are summed (decision 13 - task/standalone sessions aren't Habit Zone data).
 * @param {{ start: string, end: string }} period - Inclusive local-date window, compared against
 *   `started_at` as UTC calendar days.
 * @param {Date} now - The instant to measure a still-running session's live elapsed time at.
 * @returns {{ byHabitId: Record<string, number>, byCategoryId: Record<string, number> }} Total
 *   seconds tracked, keyed by id - category/habit display names are a data-layer/UI concern.
 */
export function computeTotalTrackedTime(habits, sessions, period, now) {
    const periodStart = new Date(`${period.start}T00:00:00Z`);
    const periodEndExclusive = new Date(
        new Date(`${period.end}T00:00:00Z`).getTime() + 24 * 60 * 60 * 1000,
    );

    const durationHabits = habits.filter((habit) => habit.measure_kind === 'duration');
    const sessionsByHabitId = groupSessionsByHabitId(sessions);

    /** @type {Record<string, number>} */
    const byHabitId = {};
    /** @type {Record<string, number>} */
    const byCategoryId = {};

    for (const habit of durationHabits) {
        const habitSessions = sessionsByHabitId.get(habit.id) ?? [];
        let habitSeconds = 0;
        for (const session of habitSessions) {
            const startedAt = new Date(session.started_at);
            if (startedAt < periodStart || startedAt >= periodEndExclusive) continue;
            habitSeconds += computeElapsedSeconds(session, now);
        }

        byHabitId[habit.id] = habitSeconds;
        if (habit.category_id) {
            byCategoryId[habit.category_id] = (byCategoryId[habit.category_id] ?? 0) + habitSeconds;
        }
    }

    return { byHabitId, byCategoryId };
}
