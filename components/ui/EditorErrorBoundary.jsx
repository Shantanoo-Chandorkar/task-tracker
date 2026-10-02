'use client';

import { catchError } from 'next/error';
import { Textarea } from '@/components/ui/textarea';

/**
 * Plain textarea shown when the rich editor fails to load or throws; holds the same HTML string so no text is lost.
 *
 * @param {object} props
 * @param {string} props.value - Current description HTML
 * @param {Function} props.onChange - Receives the new description string
 * @param {number} props.maxLength - Same limit the rich editor enforces through its parent field
 * @param {string} [props.placeholder] - Placeholder text
 */
function EditorFallback({ value, onChange, maxLength, placeholder }) {
    return (
        <Textarea
            aria-label="Description"
            value={value}
            onChange={(changeEvent) => onChange(changeEvent.target.value)}
            maxLength={maxLength}
            placeholder={placeholder}
            className="min-h-[200px]"
        />
    );
}

// A Tiptap throw or failed chunk load would otherwise reach the route error page and discard the unsaved form.
export default catchError(EditorFallback);
