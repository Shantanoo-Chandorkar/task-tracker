import { getDay, parseISO } from 'date-fns';
import { listDailyHabitOutcomes } from './daily-habit-outcomes';

const WEEKDAY_COUNT = 7;
const HOUR_COUNT = 24;

/**
 * Resolves which local hour (0-23) a moment falls in for a given timezone - the one-off hour
 * analogue of `modules/habits/domain/local-date.js`'s `resolveLocalDate`, kept local to this file
 * since it is the only KPI that needs an hour instead of a calendar date.
 *
 * @param {Date|number|string} instant - The moment to resolve.
 * @param {string} timeZone - IANA timezone name, e.g. 'Asia/Kolkata'.
 * @returns {number} The local hour, 0-23.
 */
function resolveLocalHour(instant, timeZone) {
    const date = instant instanceof Date ? instant : new Date(instant);
    const hourPart = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour: 'numeric',
        hourCycle: 'h23',
    }).format(date);
    return Number(hourPart);
}

/**
 * Successful-check-in counts per weekday - tells you *when* you tend to succeed.
 *
 * @param {Array<Record<string, any>>} habits - Habit rows in scope.
 * @param {Array<Record<string, any>>} entries - `habit_entries` rows in scope, any habits.
 * @param {{ start: string, end: string }} period - Inclusive local-date window.
 * @returns {Array<{ weekday: number, successCount: number }>} One entry per weekday, 0 (Sunday)
 *   through 6 (Saturday), matching `date-fns`'s `getDay`.
 */
function computeWeekdayDistribution(habits, entries, period) {
    const successCountByWeekday = new Array(WEEKDAY_COUNT).fill(0);
    for (const outcome of listDailyHabitOutcomes(habits, entries, period)) {
        if (!outcome.isSuccessful) continue;
        successCountByWeekday[getDay(parseISO(outcome.localDate))] += 1;
    }
    return successCountByWeekday.map((successCount, weekday) => ({ weekday, successCount }));
}

/**
 * Session count and total seconds per local hour-of-day, for habit-linked sessions - tells you
 * *when* you tend to put in focused time.
 *
 * @param {Array<Record<string, any>>} sessions - `time_sessions` rows in scope, any subject; only
 *   habit-linked ones are counted (decision 13 - task/standalone sessions aren't Habit Zone data).
 * @param {{ start: string, end: string }} period - Inclusive local-date window, compared against
 *   `started_at` as UTC calendar days (a pattern-insight KPI, not streak-critical precision).
 * @param {string} timeZone - IANA timezone name the session start times are resolved against.
 * @returns {Array<{ hour: number, sessionCount: number, totalSeconds: number }>} One entry per
 *   local hour, 0-23.
 */
function computeHourOfDayDistribution(sessions, period, timeZone) {
    const periodStart = new Date(`${period.start}T00:00:00Z`);
    const periodEndExclusive = new Date(
        new Date(`${period.end}T00:00:00Z`).getTime() + 24 * 60 * 60 * 1000,
    );

    const sessionCountByHour = new Array(HOUR_COUNT).fill(0);
    const totalSecondsByHour = new Array(HOUR_COUNT).fill(0);
    for (const session of sessions) {
        if (!session.habit_id) continue;
        const startedAt = new Date(session.started_at);
        if (startedAt < periodStart || startedAt >= periodEndExclusive) continue;

        const hour = resolveLocalHour(startedAt, timeZone);
        sessionCountByHour[hour] += 1;
        totalSecondsByHour[hour] += session.accumulated_seconds;
    }

    return sessionCountByHour.map((sessionCount, hour) => ({
        hour,
        sessionCount,
        totalSeconds: totalSecondsByHour[hour],
    }));
}

/**
 * When you tend to succeed and when you tend to focus - decision 19's KPI 4, the only one of the
 * five that is directly actionable (it converts observation into "schedule around this").
 *
 * @param {Array<Record<string, any>>} habits - Habit rows in scope.
 * @param {Array<Record<string, any>>} entries - `habit_entries` rows in scope, any habits.
 * @param {Array<Record<string, any>>} sessions - Habit-linked `time_sessions` rows in scope.
 * @param {{ start: string, end: string }} period - Inclusive local-date window.
 * @param {string} timeZone - IANA timezone name for resolving session start hours.
 * @returns {{ byWeekday: Array<{ weekday: number, successCount: number }>, byHourOfDay:
 *   Array<{ hour: number, sessionCount: number, totalSeconds: number }> }}
 */
export function computeDayTimeDistribution(habits, entries, sessions, period, timeZone) {
    return {
        byWeekday: computeWeekdayDistribution(habits, entries, period),
        byHourOfDay: computeHourOfDayDistribution(sessions, period, timeZone),
    };
}
