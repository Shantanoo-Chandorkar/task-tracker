/**
 * Count measure: a plain tally compared against a target (e.g. "20 pushups").
 * Deliberately self-contained - a change here can never ripple into quantity.js or duration.js.
 */

/**
 * @param {{ value: number }|null} entry - The day's check-in, or null if none was logged.
 * @param {{ target_value: number }} habit - The habit, for its target.
 * @returns {boolean} True when the logged count reaches the target.
 */
function isGoalMet(entry, habit) {
    return entry != null && entry.value >= habit.target_value;
}

/**
 * @param {unknown} rawValue - Value sent by the client.
 * @returns {number|null} The count as a non-negative number, or null to reject it.
 */
function normalizeValue(rawValue) {
    if (rawValue === undefined || rawValue === null) return null;
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value < 0) return null;
    return value;
}

export const countMeasure = { isGoalMet, normalizeValue };
