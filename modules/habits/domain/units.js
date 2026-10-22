/**
 * Canonical base unit per dimension; `unit_code` only governs display, so a unit switch never rewrites history.
 * Deliberately small (decision B3.1) - anything outside it falls back to a free-text custom unit.
 */
/** @type {Record<string, { dimension: string, canonicalPerUnit: number, label: string }>} */
const UNIT_DEFINITIONS = {
    // distance - canonical: metres
    km: { dimension: 'distance', canonicalPerUnit: 1000, label: 'km' },
    mi: { dimension: 'distance', canonicalPerUnit: 1609.344, label: 'mi' },
    // duration - canonical: seconds
    sec: { dimension: 'duration', canonicalPerUnit: 1, label: 'sec' },
    min: { dimension: 'duration', canonicalPerUnit: 60, label: 'min' },
    hr: { dimension: 'duration', canonicalPerUnit: 3600, label: 'hr' },
};

export const UNIT_CODES = Object.keys(UNIT_DEFINITIONS);

/**
 * Unit codes as a flat, display-ready list, so a unit picker shares the validator's own definitions.
 *
 * @type {{ code: string, label: string, dimension: string }[]}
 */
export const UNIT_OPTIONS = Object.entries(UNIT_DEFINITIONS).map(([code, definition]) => ({
    code,
    label: definition.label,
    dimension: definition.dimension,
}));

/**
 * Checks that a value is a known unit code.
 *
 * @param {unknown} unitCode - Value to check, e.g. a `habits.unit_code` column value.
 * @returns {unitCode is string} True only for a recognised unit code.
 */
export function isValidUnitCode(unitCode) {
    return typeof unitCode === 'string' && Object.hasOwn(UNIT_DEFINITIONS, unitCode);
}

/**
 * Looks up which dimension a unit code belongs to.
 *
 * @param {string} unitCode - A recognised unit code.
 * @returns {string|null} The dimension name, or null for an unknown code.
 */
export function getUnitDimension(unitCode) {
    return UNIT_DEFINITIONS[unitCode]?.dimension ?? null;
}

/**
 * Converts a value in a display unit to its dimension's canonical unit, for storage.
 *
 * @param {string} unitCode - A recognised unit code.
 * @param {number} displayValue - Value as entered by the user, in `unitCode`.
 * @returns {number} The equivalent value in the dimension's canonical unit.
 * @throws {Error} If `unitCode` is not recognised.
 */
export function toCanonicalValue(unitCode, displayValue) {
    const definition = UNIT_DEFINITIONS[unitCode];
    if (!definition) throw new Error(`Unknown unit code: ${unitCode}`);
    return displayValue * definition.canonicalPerUnit;
}

/**
 * Converts a canonical, stored value back into a display unit.
 *
 * @param {string} unitCode - A recognised unit code.
 * @param {number} canonicalValue - Value as stored, in the dimension's canonical unit.
 * @returns {number} The equivalent value in `unitCode`, rounded to 6 decimals to avoid float noise.
 * @throws {Error} If `unitCode` is not recognised.
 */
export function fromCanonicalValue(unitCode, canonicalValue) {
    const definition = UNIT_DEFINITIONS[unitCode];
    if (!definition) throw new Error(`Unknown unit code: ${unitCode}`);
    return Math.round((canonicalValue / definition.canonicalPerUnit) * 1e6) / 1e6;
}

// Cosmetic default label for a unit-less duration habit - never affects the stored value.
const IMPLICIT_DURATION_UNIT_LABEL = 'min';

/**
 * The unit label to show next to a habit's logged amount - recognised, custom free-text, or none.
 *
 * @param {Record<string, any>} habit - Needs `measure_kind` and `unit_code`.
 * @returns {string|null} The display label, or null for `count` and binary habits.
 */
export function resolveHabitUnitLabel(habit) {
    if (habit.measure_kind === 'count') return null;
    if (!habit.unit_code) {
        return habit.measure_kind === 'duration' ? IMPLICIT_DURATION_UNIT_LABEL : null;
    }
    const option = UNIT_OPTIONS.find((candidate) => candidate.code === habit.unit_code);
    return option ? option.label : habit.unit_code;
}
