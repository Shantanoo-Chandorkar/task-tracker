import DOMPurify from 'isomorphic-dompurify';

/**
 * Validates and sanitizes string inputs shared by every server action.
 */

/**
 * Removes all HTML tags; not a substitute for DOMPurify where HTML is permitted.
 *
 * @param {string} rawText - Text to strip tags from.
 * @returns {string} Text with all HTML tags removed.
 */
function stripHtmlTags(rawText) {
    if (!rawText) return rawText;
    return rawText.replace(/<[^>]*>/g, '');
}

/**
 * Trims whitespace and optionally strips HTML tags from a string.
 *
 * @param {string} rawText - Text to sanitize; non-strings yield ''.
 * @param {boolean} [shouldStripTags=true] - Whether to strip HTML tags.
 * @returns {string} The sanitized text.
 */
export function sanitizeString(rawText, shouldStripTags = true) {
    if (typeof rawText !== 'string') return '';
    let sanitizedText = rawText.trim();
    if (shouldStripTags) {
        sanitizedText = stripHtmlTags(sanitizedText);
    }
    return sanitizedText;
}

/**
 * Caps input length before it reaches the database, to prevent resource exhaustion.
 *
 * @param {string} text - Text to check (sanitize first).
 * @param {number} maxLength - Maximum allowed length.
 * @param {string} fieldName - Human-readable field name (e.g. 'Task title').
 * @param {string} [errorCode='INPUT_TOO_LONG'] - Machine-readable code returned on failure.
 * @returns {{ error: string, code: string } | null} Error object if too long, else null.
 */
export function checkMaxLength(text, maxLength, fieldName, errorCode = 'INPUT_TOO_LONG') {
    if (typeof text === 'string' && text.length > maxLength) {
        return {
            error: `${fieldName} cannot exceed ${maxLength} characters.`,
            code: errorCode,
        };
    }
    return null;
}

// The sanitizer is the trust boundary, so rel can't depend on the client editor setting it.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
        node.setAttribute('rel', 'noopener noreferrer');
    }
});

/**
 * Sanitizes editor HTML down to basic formatting tags and links.
 *
 * @param {string} rawHtml - Raw HTML from the editor.
 * @returns {string} Safe HTML, or '' for empty or non-string input.
 */
export function sanitizeRichText(rawHtml) {
    if (!rawHtml || typeof rawHtml !== 'string') return '';
    return DOMPurify.sanitize(rawHtml.trim(), {
        ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'ul', 'ol', 'li', 's', 'strike', 'del'],
        ALLOWED_ATTR: ['href', 'rel', 'target'],
    });
}
