/**
 * Small persistent label above a form control, so its purpose survives after a value is picked.
 *
 * @param {object} props
 * @param {string} props.label - Label text
 * @param {import('react').ReactNode} props.children - The field being labeled
 */
export default function LabeledField({ label, children }) {
    return (
        <div className="space-y-1 flex flex-col gap-2">
            <label className="text-xs text-muted-foreground">{label}</label>
            {children}
        </div>
    );
}
