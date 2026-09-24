'use client';

/**
 * Wraps any input with a label, live character counter and inline error, so every capped field looks the same.
 *
 * @param {object} props
 * @param {string} props.label - Visible label text.
 * @param {number} props.currentLength - Current character count.
 * @param {number} props.maxLength - Maximum allowed characters.
 * @param {string} [props.htmlFor] - `id` of the input the label points to.
 * @param {string} [props.error] - Server/action error shown below the input.
 * @param {import('react').ReactNode} props.children - The input or control being wrapped.
 */
export default function CharLimitField({
    label,
    currentLength,
    maxLength,
    htmlFor,
    error,
    children,
}) {
    const isExceeded = currentLength >= maxLength;

    return (
        <div className="space-y-1 min-w-0">
            <div className="flex items-center justify-between">
                <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
                    {label}
                </label>
                <span
                    className={`text-xs ${isExceeded ? 'text-destructive font-medium' : 'text-muted-foreground'}`}
                >
                    {currentLength}/{maxLength}
                </span>
            </div>
            {children}
            {error && <p className="text-xs text-destructive">{error}</p>}
            {isExceeded && !error && (
                <p className="text-xs text-destructive">Character limit exceeded</p>
            )}
        </div>
    );
}
