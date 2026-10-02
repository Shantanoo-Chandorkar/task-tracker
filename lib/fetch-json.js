/**
 * A failed API reply, carrying the HTTP status and the server's stable error code so callers can decide what to do.
 */
export class FetchError extends Error {
    /**
     * @param {string} message - Human-readable reason, safe to show to the user.
     * @param {object} details
     * @param {number} details.status - HTTP status of the reply.
     * @param {string|null} details.code - Machine-readable error code from the reply body, if it had one.
     */
    constructor(message, { status, code }) {
        super(message);
        this.name = 'FetchError';
        this.status = status;
        this.code = code;
    }
}

/**
 * Reads an error reply's JSON body, giving null when the body is missing or not JSON (e.g. a proxy's HTML page).
 *
 * @param {Response} response - A non-OK fetch response.
 * @returns {Promise<{ error?: string, code?: string }|null>} The parsed body, or null.
 */
async function readErrorBody(response) {
    try {
        return await response.json();
    } catch {
        return null;
    }
}

/**
 * GETs a JSON API route; the one place that forwards the abort signal and shapes failures for TanStack Query.
 *
 * @param {string} url - API path, e.g. `/api/spaces`.
 * @param {object} [options]
 * @param {AbortSignal} [options.signal] - TanStack Query's signal, so a cancelled query stops the request.
 * @returns {Promise<any>} The parsed JSON body.
 * @throws {FetchError} On a non-OK status or a reply that is not JSON.
 * @throws {TypeError|DOMException} When the request itself fails (offline) or is aborted.
 */
export async function fetchJson(url, { signal } = {}) {
    const response = await fetch(url, { signal });

    if (!response.ok) {
        const errorBody = await readErrorBody(response);
        throw new FetchError(errorBody?.error ?? `Request failed with status ${response.status}`, {
            status: response.status,
            code: errorBody?.code ?? null,
        });
    }

    try {
        return await response.json();
    } catch {
        throw new FetchError('The server sent a reply that could not be read', {
            status: response.status,
            code: null,
        });
    }
}

const MAX_RETRIES = 2;

/**
 * TanStack Query retry rule: a 4xx reply will not change by asking again, so only network and 5xx failures retry.
 *
 * @param {number} failureCount - Failures so far for this query.
 * @param {Error} error - What the last attempt threw.
 * @returns {boolean} True to try again.
 */
export function shouldRetryRequest(failureCount, error) {
    const isClientError = error?.status >= 400 && error?.status < 500;
    if (isClientError) return false;
    return failureCount < MAX_RETRIES;
}
