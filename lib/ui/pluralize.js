/**
 * Writes a count with its noun, adding an "s" unless the count is exactly one.
 *
 * @param {number} count - How many there are
 * @param {string} noun - Singular noun, e.g. "task"
 * @returns {string} e.g. "1 task" or "3 tasks"
 */
export function pluralize(count, noun) {
    return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
