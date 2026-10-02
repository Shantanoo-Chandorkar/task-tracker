/**
 * Inline form error that screen readers announce the moment it appears.
 *
 * @param {object} props
 * @param {string} [props.errorId] - Id the field points at with `aria-describedby`.
 * @param {import('react').ReactNode} [props.children] - Error text; renders nothing when empty.
 */
export default function FormError({ errorId, children }) {
    if (!children) return null;
    return (
        <p id={errorId} role="alert" className="text-xs text-destructive">
            {children}
        </p>
    );
}
