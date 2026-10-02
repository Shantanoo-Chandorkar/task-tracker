/**
 * Fetches how much a space, list or sublist would take with it when deleted, for the confirm dialog.
 *
 * @param {string} countsUrl - API path for the entity, e.g. `/api/sublists/<id>`.
 * @returns {Promise<object|null>} Parsed counts, or null on a non-OK or non-JSON reply so the dialog can still open.
 * @throws {TypeError} When the request itself fails (offline, server unreachable).
 */
export async function fetchDeleteCounts(countsUrl) {
    const response = await fetch(countsUrl);
    if (!response.ok) return null;

    try {
        return await response.json();
    } catch {
        return null;
    }
}
