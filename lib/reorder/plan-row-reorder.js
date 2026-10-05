import { arrayMove } from '@dnd-kit/sortable';

/**
 * Works out the new order of a group of rows after one is dropped on another, or null when the drop should be ignored.
 *
 * @param {{ id: string }[]} rows - The sibling rows in the order they are shown
 * @param {string} activeId - Id of the dragged row
 * @param {string} overId - Id of the row it was dropped on
 * @returns {{ reorderedRows: object[], reorderedIds: string[] }|null} The rows in their new order, or null when
 *   either id is not in the group (the list can change mid-drag)
 */
export function planRowReorder(rows, activeId, overId) {
    const oldIndex = rows.findIndex((row) => row.id === activeId);
    const newIndex = rows.findIndex((row) => row.id === overId);
    if (oldIndex === -1 || newIndex === -1) return null;

    const reorderedRows = arrayMove(rows, oldIndex, newIndex);
    return { reorderedRows, reorderedIds: reorderedRows.map((row) => row.id) };
}
