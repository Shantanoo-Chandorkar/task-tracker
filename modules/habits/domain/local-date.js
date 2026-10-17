import {
    addDays,
    differenceInCalendarDays,
    format,
    isAfter,
    isBefore,
    parseISO,
    startOfWeek,
} from 'date-fns';

/**
 * Calendar-date helpers shared by recurrence.js and streaks.js.
 * A "local date" is a plain 'YYYY-MM-DD' string, already resolved against the user's timezone (decision 3).
 */

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Checks that a value is a real calendar date in 'YYYY-MM-DD' form (rejects e.g. '2026-02-30').
 *
 * @param {unknown} value - Value to check.
 * @returns {value is string} True only for a valid 'YYYY-MM-DD' string.
 */
export function isValidLocalDateString(value) {
    if (typeof value !== 'string' || !LOCAL_DATE_PATTERN.test(value)) return false;
    const date = parseISO(value);
    // parseISO gives an Invalid Date for a nonexistent date like '2026-02-30'; format() would throw on it.
    if (Number.isNaN(date.getTime())) return false;
    return format(date, 'yyyy-MM-dd') === value;
}

/**
 * Resolves which calendar day a moment in time falls on in a given timezone.
 * A tick at 00:30 IST is a different day than 00:30 UTC - this is why `habit_entries` stores
 * `local_date` instead of deriving the day from a UTC timestamp at read time.
 *
 * @param {Date|number|string} instant - The moment to resolve.
 * @param {string} timeZone - IANA timezone name, e.g. 'Asia/Kolkata'.
 * @returns {string} 'YYYY-MM-DD' in that timezone.
 */
export function resolveLocalDate(instant, timeZone) {
    const date = instant instanceof Date ? instant : new Date(instant);
    return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}

/**
 * Checks that a string is a real IANA timezone name the runtime recognises.
 *
 * @param {unknown} timeZone - Value to check, e.g. a `profiles.timezone` column value.
 * @returns {timeZone is string} True only for a timezone name `Intl` accepts.
 */
export function isValidTimeZone(timeZone) {
    if (typeof timeZone !== 'string' || !timeZone) return false;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone });
        return true;
    } catch {
        return false;
    }
}

/**
 * Adds a number of calendar days to a local date string.
 *
 * @param {string} localDate - 'YYYY-MM-DD'.
 * @param {number} days - Days to add; negative to go backward.
 * @returns {string} The resulting 'YYYY-MM-DD'.
 */
export function addDaysToLocalDate(localDate, days) {
    return format(addDays(parseISO(localDate), days), 'yyyy-MM-dd');
}

/**
 * Counts the calendar days between two local date strings.
 *
 * @param {string} laterLocalDate - 'YYYY-MM-DD'.
 * @param {string} earlierLocalDate - 'YYYY-MM-DD'.
 * @returns {number} `laterLocalDate` minus `earlierLocalDate`, in days (negative if reversed).
 */
export function localDateDiffInDays(laterLocalDate, earlierLocalDate) {
    return differenceInCalendarDays(parseISO(laterLocalDate), parseISO(earlierLocalDate));
}

/**
 * Finds the Monday that starts the calendar week containing a local date.
 * Monday-start, matching the week convention already used by modules/tasks/domain/task-filters.js.
 *
 * @param {string} localDate - 'YYYY-MM-DD'.
 * @returns {string} 'YYYY-MM-DD' of that week's Monday.
 */
export function startOfLocalWeek(localDate) {
    return format(startOfWeek(parseISO(localDate), { weekStartsOn: 1 }), 'yyyy-MM-dd');
}

/**
 * Compares two local date strings.
 *
 * @param {string} earlierCandidate - 'YYYY-MM-DD'.
 * @param {string} laterCandidate - 'YYYY-MM-DD'.
 * @returns {boolean} True when `earlierCandidate` is strictly before `laterCandidate`.
 */
export function isLocalDateBefore(earlierCandidate, laterCandidate) {
    return isBefore(parseISO(earlierCandidate), parseISO(laterCandidate));
}

/**
 * Compares two local date strings.
 *
 * @param {string} laterCandidate - 'YYYY-MM-DD'.
 * @param {string} earlierCandidate - 'YYYY-MM-DD'.
 * @returns {boolean} True when `laterCandidate` is strictly after `earlierCandidate`.
 */
export function isLocalDateAfter(laterCandidate, earlierCandidate) {
    return isAfter(parseISO(laterCandidate), parseISO(earlierCandidate));
}
