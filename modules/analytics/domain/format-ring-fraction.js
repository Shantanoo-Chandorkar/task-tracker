/**
 * Formats a completion ring's underlying fraction as a sentence, so a rate is never shown bare.
 *
 * @param {number} completedCount - Count completed.
 * @param {number} totalCount - Count due.
 * @param {string} noun - What was counted, e.g. 'days' or 'due habits'.
 * @returns {string} e.g. "23 of 30 days completed".
 */
export function formatRingFraction(completedCount, totalCount, noun) {
    return `${completedCount} of ${totalCount} ${noun} completed`;
}
