/**
 * Read-only colored pill badge for displaying a status.
 * Used in status group headers and other display-only contexts.
 *
 * @param {object} props
 * @param {string} props.name - Status label text
 * @param {string} props.color - Hex color string (e.g. '#3b82f6')
 * @param {string} [props.className] - Additional Tailwind classes
 */
export default function StatusBadge({ name, color, className = '' }) {
    if (!name) return null;

    return (
        <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${className}`}
            style={{
                backgroundColor: color ? `${color}26` : 'transparent', // 26 = 15% opacity in hex
                color: color ?? 'inherit',
                border: `1px solid ${color ? `${color}40` : 'transparent'}`,
            }}
        >
            {name}
        </span>
    );
}
