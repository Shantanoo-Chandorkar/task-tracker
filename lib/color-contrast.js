import { THEME_BACKGROUND_COLORS } from '@/lib/theme-colors';

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const SHARE_STEP = 0.02;

/**
 * Surfaces a status pill can sit on, per theme: the page, and the card or popover colour from `app/globals.css`.
 */
export const PILL_SURFACE_COLORS = {
    light: [THEME_BACKGROUND_COLORS.light, '#f2eee8'],
    dark: [THEME_BACKGROUND_COLORS.dark, '#292521'],
};

/**
 * Where status pill text moves when it must get darker or lighter: the --foreground token of each theme.
 */
export const PILL_TEXT_TARGET_COLORS = { light: '#1c1917', dark: '#fffaf5' };

/**
 * Reads a `#rrggbb` colour; anything else (named colours, short hex, CSS functions) is rejected, so only plain hex
 * ever reaches inline styles.
 *
 * @param {unknown} hexColor - Candidate colour.
 * @returns {number[]|null} Red, green and blue from 0 to 255, or null when it is not `#rrggbb`.
 */
export function parseHexColor(hexColor) {
    if (typeof hexColor !== 'string' || !HEX_COLOR_PATTERN.test(hexColor)) return null;
    return [1, 3, 5].map((startIndex) => parseInt(hexColor.slice(startIndex, startIndex + 2), 16));
}

/**
 * Writes red, green and blue (0 to 255) as `#rrggbb`.
 *
 * @param {number[]} channels - Red, green and blue.
 * @returns {string} Lowercase hex colour.
 */
function toHexColor(channels) {
    return `#${channels
        .map((channel) =>
            Math.round(Math.min(255, Math.max(0, channel)))
                .toString(16)
                .padStart(2, '0'),
        )
        .join('')}`;
}

/**
 * Relative luminance as WCAG defines it.
 *
 * @param {number[]} channels - Red, green and blue from 0 to 255.
 * @returns {number} 0 for black up to 1 for white.
 */
function relativeLuminance(channels) {
    const [red, green, blue] = channels.map((channel) => {
        const unit = channel / 255;
        return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/**
 * Mixes one colour over another.
 *
 * @param {string} overHex - The colour laid on top.
 * @param {string} baseHex - The colour underneath.
 * @param {number} overShare - How much of the top colour, from 0 to 1.
 * @returns {string} The mixed `#rrggbb` colour.
 */
export function mixColors(overHex, baseHex, overShare) {
    const over = parseHexColor(overHex);
    const base = parseHexColor(baseHex);
    return toHexColor(
        over.map((channel, index) => channel * overShare + base[index] * (1 - overShare)),
    );
}

/**
 * WCAG contrast ratio between two colours.
 *
 * @param {string} firstHex - A `#rrggbb` colour.
 * @param {string} secondHex - Another `#rrggbb` colour.
 * @returns {number} From 1 (identical) to 21 (black on white).
 */
export function contrastRatio(firstHex, secondHex) {
    const firstLuminance = relativeLuminance(parseHexColor(firstHex));
    const secondLuminance = relativeLuminance(parseHexColor(secondHex));
    const lighter = Math.max(firstLuminance, secondLuminance);
    const darker = Math.min(firstLuminance, secondLuminance);
    return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Picks readable text for a pill tinted with the user's colour: the colour itself, moved only as far as the ratio needs.
 *
 * @param {object} params
 * @param {string} params.color - The user's `#rrggbb` colour.
 * @param {string[]} params.surfaces - Colours the pill may sit on; the text must be readable on the tint over each.
 * @param {string} params.towardsColor - Where to move the colour: near-black in light mode, near-white in dark mode.
 * @param {number} [params.tintShare] - How much of the colour the pill's background takes from the surface.
 * @param {number} [params.minimumRatio] - Required contrast ratio.
 * @returns {string|null} A `#rrggbb` text colour, or null when `color` is not a plain hex colour.
 */
export function readableTextColor({
    color,
    surfaces,
    towardsColor,
    tintShare = 0.15,
    minimumRatio = 4.5,
}) {
    if (!parseHexColor(color)) return null;

    const pillTints = surfaces.map((surface) => mixColors(color, surface, tintShare));
    for (let share = 0; share <= 1; share += SHARE_STEP) {
        const candidateTextColor = mixColors(towardsColor, color, share);
        if (pillTints.every((tint) => contrastRatio(candidateTextColor, tint) >= minimumRatio))
            return candidateTextColor;
    }
    return towardsColor;
}
