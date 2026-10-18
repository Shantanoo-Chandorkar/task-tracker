import { getDay, parseISO } from 'date-fns';
import { addDaysToLocalDate, isLocalDateAfter, localDateDiffInDays } from './local-date';

/**
 * A small, exhaustively testable recurrence engine - deliberately not rrule, since habits don't spawn rows.
 */
export const RECURRENCE_KINDS = ['daily', 'weekdays', 'times_per_week', 'every_n_days'];

/**
 * Whether a recurrence rule marks a given calendar day as a candidate day to act on.
 * `times_per_week` has no single due day, so this always returns true; streaks.js folds it by week.
 *
 * @param {Record<string, any>} rule - One of the RECURRENCE_KINDS shapes.
 * @param {string} localDate - 'YYYY-MM-DD' to test.
 * @returns {boolean} True when the date is a due/candidate day for this rule.
 */
export function isDueOn(rule, localDate) {
    switch (rule.kind) {
        case 'daily':
        case 'times_per_week':
            return true;
        case 'weekdays':
            return rule.days.includes(getDay(parseISO(localDate)));
        case 'every_n_days': {
            const daysSinceAnchor = localDateDiffInDays(localDate, rule.anchor);
            return daysSinceAnchor >= 0 && daysSinceAnchor % rule.n === 0;
        }
        default:
            return false;
    }
}

/**
 * Lists every due date for a rule within an inclusive date range, ascending.
 *
 * @param {Record<string, any>} rule - One of the RECURRENCE_KINDS shapes.
 * @param {string} startLocalDate - 'YYYY-MM-DD', inclusive.
 * @param {string} endLocalDate - 'YYYY-MM-DD', inclusive.
 * @returns {string[]} Due dates in ascending order; empty if the range is backwards.
 */
export function dueDatesBetween(rule, startLocalDate, endLocalDate) {
    /** @type {string[]} */
    const dueDates = [];
    let cursor = startLocalDate;
    while (!isLocalDateAfter(cursor, endLocalDate)) {
        if (isDueOn(rule, cursor)) dueDates.push(cursor);
        cursor = addDaysToLocalDate(cursor, 1);
    }
    return dueDates;
}
