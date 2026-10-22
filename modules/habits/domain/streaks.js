import { getMeasure } from './measures/index';
import { dueDatesBetween } from './recurrence';
import {
    addDaysToLocalDate,
    isLocalDateAfter,
    isLocalDateBefore,
    startOfLocalWeek,
} from './local-date';

/**
 * The real floor a habit's due-date math should use, since a backfilled entry may predate `started_on`.
 *
 * @param {Record<string, any>} habit - Needs `started_on`.
 * @param {Array<Record<string, any>>} entries - All check-ins for this habit, any order.
 * @returns {string} 'YYYY-MM-DD', `habit.started_on` or the earliest entry's date, whichever is first.
 */
export function resolveEffectiveStartedOn(habit, entries) {
    let effectiveStartedOn = habit.started_on;
    for (const entry of entries) {
        if (isLocalDateBefore(entry.local_date, effectiveStartedOn)) {
            effectiveStartedOn = entry.local_date;
        }
    }
    return effectiveStartedOn;
}

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
 * @param {Record<string, any>} habit - Needs recurrence, polarity, measure_kind, target_value.
 * @param {Map<string, object>} entriesByDate - Entries keyed by `local_date`.
 * @param {string} todayLocalDate - 'YYYY-MM-DD', the caller's current local date.
 * @param {string} effectiveStartedOn - 'YYYY-MM-DD', from `resolveEffectiveStartedOn`.
 * @returns {{ currentStreak: number, longestStreak: number }}
 */
function computeDailyStreaks(habit, entriesByDate, todayLocalDate, effectiveStartedOn) {
    const measure = getMeasure(habit.measure_kind);
    const dueDates = dueDatesBetween(habit.recurrence, effectiveStartedOn, todayLocalDate);

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
 * Lists every Monday-start week beginning in a range, ascending - shared by the streak walk and
 * the completion-count walk so the two can never drift apart.
 *
 * @param {string} firstWeekStartLocalDate - 'YYYY-MM-DD', a week's Monday.
 * @param {string} lastWeekStartLocalDate - 'YYYY-MM-DD', a week's Monday.
 * @returns {string[]} Week-start dates in ascending order; empty if the range is backwards.
 */
function listWeekStarts(firstWeekStartLocalDate, lastWeekStartLocalDate) {
    /** @type {string[]} */
    const weekStarts = [];
    let cursor = firstWeekStartLocalDate;
    while (!isLocalDateAfter(cursor, lastWeekStartLocalDate)) {
        weekStarts.push(cursor);
        cursor = addDaysToLocalDate(cursor, 7);
    }
    return weekStarts;
}

/**
 * Whether one Monday-start week meets a `times_per_week` habit's target, polarity-aware.
 *
 * @param {Record<string, any>} habit - The habit, for its polarity.
 * @param {{ isGoalMet: Function }} measure - The habit's measure strategy.
 * @param {Map<string, object>} entriesByDate - Entries keyed by `local_date`.
 * @param {string} weekStartLocalDate - 'YYYY-MM-DD' of that week's Monday.
 * @param {number} targetCount - The habit's `recurrence.count`.
 * @returns {boolean} True when the week counts as a success.
 */
function isWeekSuccessful(habit, measure, entriesByDate, weekStartLocalDate, targetCount) {
    const successes = countSuccessesInWeek(habit, measure, entriesByDate, weekStartLocalDate);
    return habit.polarity === 'quit' ? successes < targetCount : successes >= targetCount;
}

/**
 * Current and longest streak for a `times_per_week` habit, folded by week - there is no single due day.
 *
 * @param {Record<string, any>} habit - Needs recurrence (with `count`), polarity, measure_kind.
 * @param {Map<string, object>} entriesByDate - Entries keyed by `local_date`.
 * @param {string} todayLocalDate - 'YYYY-MM-DD', the caller's current local date.
 * @param {string} effectiveStartedOn - 'YYYY-MM-DD', from `resolveEffectiveStartedOn`.
 * @returns {{ currentStreak: number, longestStreak: number }}
 */
function computeWeeklyStreaks(habit, entriesByDate, todayLocalDate, effectiveStartedOn) {
    const measure = getMeasure(habit.measure_kind);
    const targetCount = habit.recurrence.count;
    const todayWeekStart = startOfLocalWeek(todayLocalDate);
    const weekStarts = listWeekStarts(startOfLocalWeek(effectiveStartedOn), todayWeekStart);

    let longestStreak = 0;
    let runningStreak = 0;
    for (const weekStart of weekStarts) {
        const isSuccessful = isWeekSuccessful(
            habit,
            measure,
            entriesByDate,
            weekStart,
            targetCount,
        );
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
        const isSuccessful = isWeekSuccessful(
            habit,
            measure,
            entriesByDate,
            weekStart,
            targetCount,
        );
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
 * @param {Array<Record<string, any>>} entries - All check-ins for this habit, any order.
 * @param {string} todayLocalDate - 'YYYY-MM-DD', the caller's current local date.
 * @returns {{ currentStreak: number, longestStreak: number }}
 */
export function computeStreaks(habit, entries, todayLocalDate) {
    const entriesByDate = new Map(entries.map((entry) => [entry.local_date, entry]));
    const effectiveStartedOn = resolveEffectiveStartedOn(habit, entries);
    if (habit.recurrence.kind === 'times_per_week') {
        return computeWeeklyStreaks(habit, entriesByDate, todayLocalDate, effectiveStartedOn);
    }
    return computeDailyStreaks(habit, entriesByDate, todayLocalDate, effectiveStartedOn);
}

/**
 * Whether a single day counts as a success for a habit - the public entry point Analytics uses to
 * judge one day without re-deriving the measure lookup itself.
 *
 * @param {Record<string, any>} habit - The habit, for its polarity, target and measure_kind.
 * @param {Map<string, Record<string, any>>} entriesByDate - Entries keyed by `local_date`.
 * @param {string} localDate - 'YYYY-MM-DD' day to judge.
 * @returns {boolean} True when the day counts as a success.
 */
export function isHabitDaySuccessful(habit, entriesByDate, localDate) {
    // Trusted: habits_measure_kind_valid (migration 0044) guarantees measure_kind is recognised.
    const measure = getMeasure(habit.measure_kind);
    return isDaySuccessful(habit, measure, entriesByDate, localDate);
}

/**
 * How much of a single day's goal was logged, as a 0-1 fraction - finer-grained than pass/fail.
 *
 * @param {Record<string, any>} habit - The habit, for its polarity, measure_kind and target_value.
 * @param {Map<string, Record<string, any>>} entriesByDate - Entries keyed by `local_date`.
 * @param {string} localDate - 'YYYY-MM-DD' day to judge.
 * @returns {number} 0 to 1; 1 means the day's goal was fully met.
 */
export function computeHabitDayProgress(habit, entriesByDate, localDate) {
    const entry = entriesByDate.get(localDate) ?? null;
    // A quit habit is always binary (checkHabitPolarityMeasureCombination) - presence is the slip.
    if (habit.polarity === 'quit') return entry == null ? 1 : 0;
    if (habit.measure_kind === 'binary') return entry == null ? 0 : 1;
    if (entry == null) return 0;
    return Math.min(entry.value / habit.target_value, 1);
}

/**
 * Due and completed counts for a habit within a period - the completion-rate KPI's building block.
 * Clamped to the habit's effective start, same clamp `computeStreaks` applies via `dueDatesBetween`.
 *
 * @param {Record<string, any>} habit - Needs recurrence, polarity, measure_kind, target_value, started_on.
 * @param {Array<Record<string, any>>} entries - All check-ins for this habit, any order.
 * @param {{ start: string, end: string }} period - Inclusive local-date window to count over.
 * @returns {{ dueCount: number, completedCount: number }}
 */
export function computeCompletionCounts(habit, entries, period) {
    const entriesByDate = new Map(entries.map((entry) => [entry.local_date, entry]));
    // Trusted: habits_measure_kind_valid (migration 0044) guarantees measure_kind is recognised.
    const measure = getMeasure(habit.measure_kind);
    const effectiveStartedOn = resolveEffectiveStartedOn(habit, entries);
    const periodStart = isLocalDateAfter(effectiveStartedOn, period.start)
        ? effectiveStartedOn
        : period.start;
    if (isLocalDateAfter(periodStart, period.end)) return { dueCount: 0, completedCount: 0 };

    if (habit.recurrence.kind === 'times_per_week') {
        const targetCount = habit.recurrence.count;
        const weekStarts = listWeekStarts(
            startOfLocalWeek(periodStart),
            startOfLocalWeek(period.end),
        );
        const completedCount = weekStarts.filter((weekStart) =>
            isWeekSuccessful(habit, measure, entriesByDate, weekStart, targetCount),
        ).length;
        return { dueCount: weekStarts.length, completedCount };
    }

    const dueDates = dueDatesBetween(habit.recurrence, periodStart, period.end);
    const completedCount = dueDates.filter((localDate) =>
        isDaySuccessful(habit, measure, entriesByDate, localDate),
    ).length;
    return { dueCount: dueDates.length, completedCount };
}
