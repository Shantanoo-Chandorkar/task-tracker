/**
 * Canonical base unit per dimension; `unit_code` only governs display, so a unit switch never rewrites history.
 */
/** @type {Record<string, { dimension: string, canonicalPerUnit: number, label: string }>} */
const UNIT_DEFINITIONS = {
    // distance - canonical: metres
    m: { dimension: 'distance', canonicalPerUnit: 1, label: 'm' },
    km: { dimension: 'distance', canonicalPerUnit: 1000, label: 'km' },
    mi: { dimension: 'distance', canonicalPerUnit: 1609.344, label: 'mi' },
    // mass - canonical: grams
    g: { dimension: 'mass', canonicalPerUnit: 1, label: 'g' },
    kg: { dimension: 'mass', canonicalPerUnit: 1000, label: 'kg' },
    lb: { dimension: 'mass', canonicalPerUnit: 453.592, label: 'lb' },
    // volume - canonical: millilitres
    ml: { dimension: 'volume', canonicalPerUnit: 1, label: 'ml' },
    l: { dimension: 'volume', canonicalPerUnit: 1000, label: 'l' },
    fl_oz: { dimension: 'volume', canonicalPerUnit: 29.5735, label: 'fl oz' },
    // duration - canonical: seconds
    sec: { dimension: 'duration', canonicalPerUnit: 1, label: 'sec' },
    min: { dimension: 'duration', canonicalPerUnit: 60, label: 'min' },
    hr: { dimension: 'duration', canonicalPerUnit: 3600, label: 'hr' },
};

export const UNIT_CODES = Object.keys(UNIT_DEFINITIONS);

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
 * @returns {number} The equivalent value in `unitCode`.
 * @throws {Error} If `unitCode` is not recognised.
 */
export function fromCanonicalValue(unitCode, canonicalValue) {
    const definition = UNIT_DEFINITIONS[unitCode];
    if (!definition) throw new Error(`Unknown unit code: ${unitCode}`);
    return canonicalValue / definition.canonicalPerUnit;
}
