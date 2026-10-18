/**
 * Converts habit target/entry values between their display unit and canonical storage unit.
 */
import { isValidUnitCode, toCanonicalValue, fromCanonicalValue } from './units';

// Minutes is the natural default display unit for a duration habit with no stored unit_code.
export const IMPLICIT_DURATION_UNIT_CODE = 'min';

/**
 * Resolves which unit a habit's target/entry values are actually expressed in for conversion -
 * falls back to minutes for a unit-less duration habit, null for anything else without a unit.
 *
 * @param {Record<string, any>} habit - The habit (or a shape of it), for `measure_kind`/`unit_code`.
 * @returns {string|null} A built-in unit code, or null when the value has no fixed unit.
 */
function resolveDisplayUnitCode(habit) {
    if (habit.unit_code) return habit.unit_code;
    if (habit.measure_kind === 'duration') return IMPLICIT_DURATION_UNIT_CODE;
    return null;
}

/**
 * Converts a target/entry value from the habit's display unit to its canonical storage unit.
 * A custom (non-built-in) unit and a count habit have no fixed ratio, so the value passes through.
 *
 * @param {Record<string, any>} habit - The habit the value belongs to.
 * @param {number|null|undefined} displayValue - Value as entered by the user.
 * @returns {number|null|undefined} The value to store.
 */
export function toCanonicalHabitValue(habit, displayValue) {
    const unitCode = resolveDisplayUnitCode(habit);
    if (displayValue === null || displayValue === undefined || !isValidUnitCode(unitCode)) {
        return displayValue;
    }
    return toCanonicalValue(unitCode, displayValue);
}

/**
 * Converts a stored target/entry value back to the habit's display unit.
 *
 * @param {Record<string, any>} habit - The habit the value belongs to.
 * @param {number|null|undefined} canonicalValue - Value as stored.
 * @returns {number|null|undefined} The value to show the user.
 */
export function toDisplayHabitValue(habit, canonicalValue) {
    const unitCode = resolveDisplayUnitCode(habit);
    if (canonicalValue === null || canonicalValue === undefined || !isValidUnitCode(unitCode)) {
        return canonicalValue;
    }
    return fromCanonicalValue(unitCode, canonicalValue);
}
