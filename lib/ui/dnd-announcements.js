export const SCREEN_READER_INSTRUCTIONS = {
    draggable:
        'To pick up a row, press space or enter on its drag handle. Use the arrow keys to move it, ' +
        'space or enter to drop it, and escape to cancel.',
};

/**
 * Describes where a sortable entry sits, e.g. "position 2 of 5", from the data dnd-kit's sortable adds.
 *
 * @param {object} [dragEntry] - dnd-kit `active` or `over` entry.
 * @returns {string|null} The position text, or null when dnd-kit gave no position data.
 */
function describePosition(dragEntry) {
    const sortableData = dragEntry?.data?.current?.sortable;
    if (!sortableData) return null;
    return `position ${sortableData.index + 1} of ${sortableData.items.length}`;
}

/**
 * Builds dnd-kit's screen reader announcements so they use names, not the raw ids dnd-kit would read out.
 *
 * @param {(id: string) => string|undefined} getRowName - Looks up the visible name of a row from its id.
 * @returns {{ onDragStart: Function, onDragOver: Function, onDragEnd: Function, onDragCancel: Function }}
 *   Handlers in dnd-kit's `accessibility.announcements` shape, each returning the sentence to speak.
 */
export function buildAnnouncements(getRowName) {
    const nameOf = (dragEntry) => getRowName(dragEntry.id) ?? 'item';

    return {
        onDragStart({ active }) {
            const position = describePosition(active);
            return `Picked up ${nameOf(active)}${position ? `, ${position}` : ''}.`;
        },
        onDragOver({ active, over }) {
            if (!over) return `${nameOf(active)} is no longer over a place to drop.`;
            return `${nameOf(active)} moved to ${describePosition(over) ?? 'a new position'}.`;
        },
        onDragEnd({ active, over }) {
            const position = over ? describePosition(over) : null;
            return `${nameOf(active)} dropped${position ? ` at ${position}` : ''}.`;
        },
        onDragCancel({ active }) {
            return `Move cancelled. ${nameOf(active)} is back where it was.`;
        },
    };
}
