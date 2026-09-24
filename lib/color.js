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
    // parseInt accepts a partly valid pair like '5g' as 5, so digits must be checked up front
    if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(normalized)) {
        throw new Error(`Invalid hex color: ${hex}`);
    }

    const full =
        normalized.length === 3
            ? normalized
                  .split('')
                  .map((hexDigit) => hexDigit + hexDigit)
                  .join('')
            : normalized;

    const red = parseInt(full.slice(0, 2), 16);
    const green = parseInt(full.slice(2, 4), 16);
    const blue = parseInt(full.slice(4, 6), 16);

    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
