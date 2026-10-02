import {
    PILL_SURFACE_COLORS,
    PILL_TEXT_TARGET_COLORS,
    parseHexColor,
    readableTextColor,
} from '@/lib/color-contrast';

// Matches the colour the server gives a status that was created without one
const DEFAULT_STATUS_COLOR = '#6b7280';

const textColorsByStatusColor = new Map();

/**
 * Text colours for a status pill per theme, each readable on its tint; cached since the same few colours repeat.
 *
 * @param {string} statusColor - A `#rrggbb` colour.
 * @returns {{ light: string, dark: string }} Text colour for the light and the dark theme.
 */
function getReadableTextColors(statusColor) {
    const knownTextColors = textColorsByStatusColor.get(statusColor);
    if (knownTextColors) return knownTextColors;

    const readableTextColors = {
        light: readableTextColor({
            color: statusColor,
            surfaces: PILL_SURFACE_COLORS.light,
            towardsColor: PILL_TEXT_TARGET_COLORS.light,
        }),
        dark: readableTextColor({
            color: statusColor,
            surfaces: PILL_SURFACE_COLORS.dark,
            towardsColor: PILL_TEXT_TARGET_COLORS.dark,
        }),
    };
    textColorsByStatusColor.set(statusColor, readableTextColors);
    return readableTextColors;
}

/**
 * Read-only colored pill badge for displaying a status.
 * Used in status group headers and other display-only contexts.
 *
 * @param {object} props
 * @param {string} props.name - Status label text
 * @param {string} props.color - Hex color string (e.g. '#3b82f6'); anything else falls back to grey
 * @param {string} [props.className] - Additional Tailwind classes
 */
export default function StatusBadge({ name, color, className = '' }) {
    if (!name) return null;

    const pillColor = color ? (parseHexColor(color) ? color : DEFAULT_STATUS_COLOR) : null;
    const textColors = pillColor ? getReadableTextColors(pillColor) : null;

    return (
        <span
            className={`inline-flex max-w-full items-center px-2 py-0.5 rounded-full text-xs font-medium min-w-0 [overflow-wrap:anywhere] ${
                textColors
                    ? 'text-[color:var(--status-text-light)] dark:text-[color:var(--status-text-dark)]'
                    : ''
            } ${className}`}
            style={{
                backgroundColor: pillColor ? `${pillColor}26` : 'transparent', // 26 = 15% opacity in hex
                border: `1px solid ${pillColor ? `${pillColor}40` : 'transparent'}`,
                ...(textColors && {
                    '--status-text-light': textColors.light,
                    '--status-text-dark': textColors.dark,
                }),
            }}
        >
            {name}
        </span>
    );
}
