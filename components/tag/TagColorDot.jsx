/**
 * Small coloured dot that shows a tag's colour beside its name.
 *
 * @param {object} props
 * @param {string} [props.color] - The tag's `#rrggbb` colour; the dot is left out when there is none
 */
export default function TagColorDot({ color }) {
    if (!color) return null;
    return (
        <span
            aria-hidden="true"
            className="h-2 w-2 flex-shrink-0 rounded-full"
            style={{ backgroundColor: color }}
        />
    );
}
