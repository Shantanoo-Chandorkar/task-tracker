import { FilterXSS } from 'xss';

/**
 * Validates and sanitizes string inputs shared by every server action.
 */

/**
 * Removes all HTML tags; not a substitute for sanitizeRichText where HTML is permitted.
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

// rel is not allowlisted, so a client-supplied value can never survive; the code always adds its own below
const ALLOWED_ATTRIBUTES_BY_TAG = {
    a: ['href', 'target'],
    b: [],
    i: [],
    em: [],
    strong: [],
    p: [],
    ul: [],
    ol: [],
    li: [],
    s: [],
    strike: [],
    del: [],
};

// Pure JS, unlike a DOM-based sanitizer, so it loads in serverless functions without jsdom
const richTextFilter = new FilterXSS({
    whiteList: ALLOWED_ATTRIBUTES_BY_TAG,
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script', 'style'],
});

/**
 * Sanitizes editor HTML down to basic formatting tags and links.
 *
 * @param {string} rawHtml - Raw HTML from the editor.
 * @returns {string} Safe HTML with rel="noopener noreferrer" on every link, or '' for empty or non-string input.
 */
export function sanitizeRichText(rawHtml) {
    if (!rawHtml || typeof rawHtml !== 'string') return '';
    // The filter rebuilds every tag, so any remaining "<a" is a real link tag and not user text
    return richTextFilter.process(rawHtml.trim()).replace(/<a(?=[\s>])/g, '<a rel="noopener noreferrer"');
}
