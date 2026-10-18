/**
 * Binary measure: presence of a check-in is the goal - there is no amount to compare against a target.
 */

/**
 * @param {{ value: number }|null} entry - The day's check-in, or null if none was logged.
 * @returns {boolean} True when a check-in was logged for the day.
 */
function isGoalMet(entry) {
    return entry != null;
}

/**
 * A binary check-in always normalizes to 1; presence, not amount, is what counts.
 *
 * @param {unknown} rawValue - Value sent by the client, if any.
 * @returns {number|null} 1 for an accepted value, or null to reject it.
 */
function normalizeValue(rawValue) {
    if (rawValue === undefined || rawValue === null || rawValue === true || rawValue === 1) {
        return 1;
    }
    return null;
}

export const binaryMeasure = { isGoalMet, normalizeValue };
