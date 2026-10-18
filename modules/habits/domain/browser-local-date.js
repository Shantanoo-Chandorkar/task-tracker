/**
 * Shared by every client-only "what day is it" need (form defaults, the Today view's filter).
 * Deliberately not timezone-aware like `resolveLocalDate` - no profile fetch here, browser-local is close enough.
 *
 * @returns {string} 'YYYY-MM-DD' in the browser's own local time.
 */
export function getBrowserTodayLocalDate() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
}
