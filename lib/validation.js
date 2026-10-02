import { FilterXSS, escapeHtml } from 'xss';

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

/**
 * Rejects a flag field whose value is not a real boolean, so strings like "false" can't be stored as true.
 *
 * @param {unknown} value - Client-supplied flag value.
 * @param {string} fieldName - Human-readable field name (e.g. 'Priority').
 * @param {string} errorCode - Machine-readable code returned on failure.
 * @returns {{ error: string, code: string } | null} Error object if not a boolean, else null.
 */
export function checkIsBoolean(value, fieldName, errorCode) {
    if (typeof value === 'boolean') return null;
    return { error: `${fieldName} must be true or false`, code: errorCode };
}

const REDIRECT_PROBE_ORIGIN = 'http://redirect-probe.invalid';

/**
 * Guards a redirect target against any value that `new URL()` resolves to another origin.
 *
 * @param {string} rawPath - The `next` query param as read from the request.
 * @returns {string} `rawPath` unchanged if it's a same-origin relative path, otherwise '/'.
 */
export function sanitizeRedirectPath(rawPath) {
    if (typeof rawPath !== 'string' || !rawPath.startsWith('/')) return '/';
    // Resolving with the same parser as the redirect catches `/\host` and `/<tab>/host`, which a prefix check misses
    const resolvedOrigin = new URL(rawPath, REDIRECT_PROBE_ORIGIN).origin;
    return resolvedOrigin === REDIRECT_PROBE_ORIGIN ? rawPath : '/';
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

/**
 * Drops a disallowed tag but keeps stray "<...>" text, such as "a < b and b > c", as escaped text.
 *
 * @param {string} tagName - Tag name the filter parsed; unused, the raw markup decides.
 * @param {string} rawMarkup - The original text from "<" to ">".
 * @returns {string} '' for something shaped like a real tag, otherwise the HTML-escaped text.
 */
function dropRealTagOrEscapeText(tagName, rawMarkup) {
    return /^<\/?[a-z!?]/i.test(rawMarkup) ? '' : escapeHtml(rawMarkup);
}

// Pure JS, unlike a DOM-based sanitizer, so it loads in serverless functions without jsdom
const richTextFilter = new FilterXSS({
    whiteList: ALLOWED_ATTRIBUTES_BY_TAG,
    onIgnoreTag: dropRealTagOrEscapeText,
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
    return richTextFilter
        .process(rawHtml.trim())
        .replace(/<a(?=[\s>])/g, '<a rel="noopener noreferrer"');
}

const LINK_URL_MAX_LENGTH = 2048;
const ALLOWED_LINK_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:'];
// A scheme is letters then ":", but "example.com:8080" is a host and port, so a digit after ":" is not a scheme
const EXPLICIT_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:(?!\d)/i;

/**
 * Turns what a user typed into a link address that is safe to store, adding https:// when no scheme is given.
 *
 * @param {string} rawUrl - Text typed into the link dialog.
 * @returns {{ url: string } | { error: string, code: string }} The address to store, or why it was rejected.
 */
export function normalizeLinkUrl(rawUrl) {
    const trimmedUrl = sanitizeString(rawUrl, false);

    if (!trimmedUrl) {
        return { error: 'Enter a link address.', code: 'LINK_URL_REQUIRED' };
    }
    if (trimmedUrl.length > LINK_URL_MAX_LENGTH) {
        return {
            error: `Link address cannot exceed ${LINK_URL_MAX_LENGTH} characters.`,
            code: 'LINK_URL_TOO_LONG',
        };
    }
    if (/\s/.test(trimmedUrl)) {
        return { error: 'Link address cannot contain spaces.', code: 'LINK_URL_INVALID' };
    }

    const candidateUrl = EXPLICIT_SCHEME_PATTERN.test(trimmedUrl)
        ? trimmedUrl
        : `https://${trimmedUrl}`;

    let parsedUrl;
    try {
        parsedUrl = new URL(candidateUrl);
    } catch {
        return { error: 'Enter a valid link address.', code: 'LINK_URL_INVALID' };
    }
    if (!ALLOWED_LINK_PROTOCOLS.includes(parsedUrl.protocol)) {
        return {
            error: 'Only http, https, mailto and tel links are allowed.',
            code: 'LINK_URL_UNSUPPORTED_PROTOCOL',
        };
    }

    return { url: candidateUrl };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Checks that a value has UUID shape, so a malformed id never reaches a uuid column and surfaces as a DB error.
 *
 * @param {unknown} candidateId - Value to test, e.g. a route param.
 * @returns {boolean} True only for a string in 8-4-4-4-12 hex form.
 */
export function isUuid(candidateId) {
    return typeof candidateId === 'string' && UUID_PATTERN.test(candidateId);
}
