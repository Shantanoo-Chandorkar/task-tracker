import { deriveDeviceLabel } from './device-label';

const MAX_LOGGED_ERROR_NAME_LENGTH = 100;
const MAX_LOGGED_ERROR_MESSAGE_LENGTH = 300;

/**
 * Collapses whitespace to single spaces and caps length before client-supplied text reaches the log.
 *
 * Collapsing matters because embedded newlines are the actual log-forging risk here.
 *
 * @param {unknown} rawText - Client-supplied text; non-strings yield ''.
 * @param {number} maxLength - Maximum characters to keep.
 * @returns {string}
 */
function sanitizeForLogging(rawText, maxLength) {
    if (typeof rawText !== 'string') return '';
    return rawText.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

/**
 * Logs a WebAuthn ceremony failure that happened entirely in the browser - the client logs nothing itself.
 *
 * @param {'registration'|'authentication'} surface - Which ceremony failed.
 * @param {object} fields
 * @param {unknown} fields.errorName - The browser error's `.name`, client-supplied.
 * @param {unknown} fields.errorMessage - The browser error's `.message`, client-supplied.
 * @param {string|null} fields.userAgent - The request's own User-Agent header, never client-supplied.
 */
export function logClientCeremonyFailure(surface, { errorName, errorMessage, userAgent }) {
    console.error(`[webauthn] client-side ${surface} ceremony failed`, {
        errorName: sanitizeForLogging(errorName, MAX_LOGGED_ERROR_NAME_LENGTH),
        errorMessage: sanitizeForLogging(errorMessage, MAX_LOGGED_ERROR_MESSAGE_LENGTH),
        deviceLabel: deriveDeviceLabel(userAgent),
    });
}
