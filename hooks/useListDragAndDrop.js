'use client';

import { siblingScopedCollisionDetection } from '@/lib/tasks/sibling-collision';
import { buildAnnouncements, SCREEN_READER_INSTRUCTIONS } from '@/lib/ui/dnd-announcements';
import { useTaskReorder } from '@/hooks/useTaskReorder';
import { useSublistReorder } from '@/hooks/useSublistReorder';
import { useDragSensors } from '@/hooks/useDragSensors';

/**
 * Everything a task list needs for drag and drop: sensors, announcements and the reorder handlers.
 *
 * @param {string} listId - The list being reordered
 * @param {object[]} flatList - Flat array of all tasks in the list
 * @param {object[]} sublists - The list's sublists in display order
 * @returns {{
 *   dndContextProps: object,
 *   onMoveTask: (taskId: string, neighbourId: string) => Promise<void>,
 *   onMoveSublist: (sublistId: string, neighbourId: string) => Promise<void>,
 * }} Props to spread on `DndContext`, plus the Move up / Move down handlers for rows and sublist headers.
 */
export function useListDragAndDrop(listId, flatList, sublists) {
    const { handleTaskDragEnd, onMoveTask } = useTaskReorder(listId, flatList);
    const { handleSublistDragEnd, moveSublistNextTo } = useSublistReorder(listId, sublists);

    const sensors = useDragSensors();

    const announcements = buildAnnouncements(
        (rowId) =>
            flatList.find((task) => task.id === rowId)?.title ??
            sublists.find((sublist) => sublist.id === rowId)?.name,
    );

    function handleDragEnd({ active, over }) {
        if (!over || active.id === over.id) return;
        if (active.data.current?.type === 'sublist') {
            return handleSublistDragEnd({ active, over });
        }
        return handleTaskDragEnd({ active, over });
    }

    return {
        dndContextProps: {
            id: 'task-list-dnd',
            sensors,
            collisionDetection: siblingScopedCollisionDetection,
            onDragEnd: handleDragEnd,
            accessibility: { announcements, screenReaderInstructions: SCREEN_READER_INSTRUCTIONS },
        },
        onMoveTask,
        onMoveSublist: moveSublistNextTo,
    };
}
