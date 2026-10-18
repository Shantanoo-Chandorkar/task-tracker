/**
 * Duration measure: seconds spent compared against a target (e.g. "meditate 10 minutes").
 * Canonical seconds (decision 14); deliberately self-contained - see count.js for why.
 */

/**
 * @param {{ value: number }|null} entry - The day's check-in, or null if none was logged.
 * @param {{ target_value: number }} habit - The habit, for its target (seconds).
 * @returns {boolean} True when the logged duration reaches the target.
 */
function isGoalMet(entry, habit) {
    return entry != null && entry.value >= habit.target_value;
}

/**
 * @param {unknown} rawValue - Seconds sent by the client.
 * @returns {number|null} The duration as a non-negative number of seconds, or null to reject it.
 */
function normalizeValue(rawValue) {
    if (rawValue === undefined || rawValue === null) return null;
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value < 0) return null;
    return value;
}

export const durationMeasure = { isGoalMet, normalizeValue };
