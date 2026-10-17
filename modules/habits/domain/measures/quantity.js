/**
 * Quantity measure: an amount in a unit compared against a target (e.g. "drink 2 l of water").
 * Values are canonical (decision 14); deliberately self-contained - see count.js for why.
 */

/**
 * @param {{ value: number }|null} entry - The day's check-in, or null if none was logged.
 * @param {{ target_value: number }} habit - The habit, for its target (canonical units).
 * @returns {boolean} True when the logged amount reaches the target.
 */
function isGoalMet(entry, habit) {
    return entry != null && entry.value >= habit.target_value;
}

/**
 * @param {unknown} rawValue - Canonical amount sent by the client.
 * @returns {number|null} The amount as a non-negative number, or null to reject it.
 */
function normalizeValue(rawValue) {
    if (rawValue === undefined || rawValue === null) return null;
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value < 0) return null;
    return value;
}

export const quantityMeasure = { isGoalMet, normalizeValue };
