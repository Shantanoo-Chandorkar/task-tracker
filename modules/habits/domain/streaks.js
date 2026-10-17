import { getMeasure } from './measures/index';
import { dueDatesBetween } from './recurrence';
import { addDaysToLocalDate, isLocalDateAfter, startOfLocalWeek } from './local-date';

/**
 * Whether a single due day counts as a success - for a quit habit, absence is the success (decision 7).
 *
 * @param {Record<string, any>} habit - The habit, for its polarity and target.
 * @param {{ isGoalMet: Function }} measure - The habit's measure strategy.
 * @param {Map<string, object>} entriesByDate - Entries keyed by `local_date`.
 * @param {string} localDate - 'YYYY-MM-DD' day to judge.
 * @returns {boolean} True when the day counts as a success.
 */
function isDaySuccessful(habit, measure, entriesByDate, localDate) {
    const entry = entriesByDate.get(localDate) ?? null;
    if (habit.polarity === 'quit') return entry == null;
    return measure.isGoalMet(entry, habit);
}

/**
 * Whether a not-yet-successful period should be held back from breaking a streak, since it isn't over yet.
 * Only a build habit gets this: a quit slip is final the moment it's logged, with no "not yet" state.
 *
 * @param {Record<string, any>} habit - The habit, for its polarity.
 * @param {boolean} isSuccessful - This period's outcome as of now.
 * @param {boolean} isCurrentPeriod - Whether this is today / the current week, not a past one.
 * @returns {boolean} True when a failure reading should be held back rather than breaking a streak.
 */
function isGracePeriod(habit, isSuccessful, isCurrentPeriod) {
    return habit.polarity === 'build' && !isSuccessful && isCurrentPeriod;
}

/**
 * Current and longest streak for a daily/weekdays/every_n_days habit, walked day by day.
 *
 * @param {Record<string, any>} habit - Needs recurrence, polarity, measure_kind, target_value, started_on.
 * @param {Map<string, object>} entriesByDate - Entries keyed by `local_date`.
 * @param {string} todayLocalDate - 'YYYY-MM-DD', the caller's current local date.
 * @returns {{ currentStreak: number, longestStreak: number }}
 */
function computeDailyStreaks(habit, entriesByDate, todayLocalDate) {
    const measure = getMeasure(habit.measure_kind);
    const dueDates = dueDatesBetween(habit.recurrence, habit.started_on, todayLocalDate);

    let longestStreak = 0;
    let runningStreak = 0;
    for (const localDate of dueDates) {
        const isSuccessful = isDaySuccessful(habit, measure, entriesByDate, localDate);
        if (isSuccessful) {
            runningStreak += 1;
            longestStreak = Math.max(longestStreak, runningStreak);
        } else if (!isGracePeriod(habit, isSuccessful, localDate === todayLocalDate)) {
            runningStreak = 0;
        }
    }

    let currentStreak = 0;
    for (let i = dueDates.length - 1; i >= 0; i -= 1) {
        const localDate = dueDates[i];
        const isSuccessful = isDaySuccessful(habit, measure, entriesByDate, localDate);
        if (isSuccessful) {
            currentStreak += 1;
            continue;
        }
        if (isGracePeriod(habit, isSuccessful, localDate === todayLocalDate)) continue;
        break;
    }

    return { currentStreak, longestStreak };
}

/**
 * Counts how many due days inside one Monday-start week already meet the measure's goal.
 *
 * @param {Record<string, any>} habit - The habit, for its measure and target.
 * @param {{ isGoalMet: Function }} measure - The habit's measure strategy.
 * @param {Map<string, object>} entriesByDate - Entries keyed by `local_date`.
 * @param {string} weekStartLocalDate - 'YYYY-MM-DD' of that week's Monday.
 * @returns {number} Qualifying days logged so far this week.
 */
function countSuccessesInWeek(habit, measure, entriesByDate, weekStartLocalDate) {
    let successCount = 0;
    for (let offset = 0; offset < 7; offset += 1) {
        const entry = entriesByDate.get(addDaysToLocalDate(weekStartLocalDate, offset)) ?? null;
        if (entry != null && measure.isGoalMet(entry, habit)) successCount += 1;
    }
    return successCount;
}

/**
 * Current and longest streak for a `times_per_week` habit, folded by week - there is no single due day.
 *
 * @param {Record<string, any>} habit - Needs recurrence (with `count`), polarity, measure_kind, started_on.
 * @param {Map<string, object>} entriesByDate - Entries keyed by `local_date`.
 * @param {string} todayLocalDate - 'YYYY-MM-DD', the caller's current local date.
 * @returns {{ currentStreak: number, longestStreak: number }}
 */
function computeWeeklyStreaks(habit, entriesByDate, todayLocalDate) {
    const measure = getMeasure(habit.measure_kind);
    const targetCount = habit.recurrence.count;
    const todayWeekStart = startOfLocalWeek(todayLocalDate);

    /** @type {string[]} */
    const weekStarts = [];
    let cursor = startOfLocalWeek(habit.started_on);
    while (!isLocalDateAfter(cursor, todayWeekStart)) {
        weekStarts.push(cursor);
        cursor = addDaysToLocalDate(cursor, 7);
    }

    /** @param {string} weekStart */
    const isWeekSuccessful = (weekStart) => {
        const successes = countSuccessesInWeek(habit, measure, entriesByDate, weekStart);
        return habit.polarity === 'quit' ? successes < targetCount : successes >= targetCount;
    };

    let longestStreak = 0;
    let runningStreak = 0;
    for (const weekStart of weekStarts) {
        const isSuccessful = isWeekSuccessful(weekStart);
        if (isSuccessful) {
            runningStreak += 1;
            longestStreak = Math.max(longestStreak, runningStreak);
        } else if (!isGracePeriod(habit, isSuccessful, weekStart === todayWeekStart)) {
            runningStreak = 0;
        }
    }

    let currentStreak = 0;
    for (let i = weekStarts.length - 1; i >= 0; i -= 1) {
        const weekStart = weekStarts[i];
        const isSuccessful = isWeekSuccessful(weekStart);
        if (isSuccessful) {
            currentStreak += 1;
            continue;
        }
        if (isGracePeriod(habit, isSuccessful, weekStart === todayWeekStart)) continue;
        break;
    }

    return { currentStreak, longestStreak };
}

/**
 * Current and longest streak for a habit, polarity- and recurrence-aware.
 *
 * @param {Record<string, any>} habit - The habit row (recurrence, polarity, measure_kind, target_value, started_on).
 * @param {Array<{ local_date: string, value: number }>} entries - All check-ins for this habit, any order.
 * @param {string} todayLocalDate - 'YYYY-MM-DD', the caller's current local date.
 * @returns {{ currentStreak: number, longestStreak: number }}
 */
export function computeStreaks(habit, entries, todayLocalDate) {
    const entriesByDate = new Map(entries.map((entry) => [entry.local_date, entry]));
    if (habit.recurrence.kind === 'times_per_week') {
        return computeWeeklyStreaks(habit, entriesByDate, todayLocalDate);
    }
    return computeDailyStreaks(habit, entriesByDate, todayLocalDate);
}
