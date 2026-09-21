'use client';

import { sanitizeRichText } from '@/lib/validation';

/**
 * Renders editor HTML, re-sanitized client-side in case stored content bypassed server sanitization.
 *
 * @param {object} props
 * @param {string|null} [props.html] - Raw HTML to render; renders nothing if falsy.
 */
export default function RichTextRenderer({ html }) {
    if (!html) return null;

    const sanitizedHtml = sanitizeRichText(html);

    return (
        <div
            className="prose prose-sm dark:prose-invert max-w-none text-foreground prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 whitespace-normal break-words"
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
        />
    );
}
