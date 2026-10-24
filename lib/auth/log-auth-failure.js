/**
 * Logs an auth failure server-side, never the password or the email address (personal data).
 *
 * @param {string} code - One of AUTH_ERROR_CODES.
 * @param {string} detail - The underlying error message, if any.
 */
export function logAuthFailure(code, detail) {
    console.warn(`[auth] ${code}`, { detail });
}
