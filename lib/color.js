/**
 * Converts a hex color to an rgba() string, for tinted variants of existing colors.
 *
 * @param {string} hex 3- or 6-digit hex color, with or without leading '#'.
 * @param {number} alpha Opacity from 0 to 1.
 * @return {string} rgba(r, g, b, alpha) string.
 * @throws {Error} If hex is not a valid 3- or 6-digit hex color.
 */
export function hexToRgba(hex, alpha) {
    const normalized = hex.replace('#', '');
    const isShort = normalized.length === 3;
    if (!isShort && normalized.length !== 6) {
        throw new Error(`Invalid hex color: ${hex}`);
    }

    const full = isShort
        ? normalized.split('').map((hexDigit) => hexDigit + hexDigit).join('')
        : normalized;

    const red = parseInt(full.slice(0, 2), 16);
    const green = parseInt(full.slice(2, 4), 16);
    const blue = parseInt(full.slice(4, 6), 16);
    if ([red, green, blue].some(Number.isNaN)) {
        throw new Error(`Invalid hex color: ${hex}`);
    }

    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
