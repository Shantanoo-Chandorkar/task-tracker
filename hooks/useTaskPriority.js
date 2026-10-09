'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { updateTask } from '@/actions/task-update-actions';
import { bustPageCache } from '@/lib/cache/service-worker-cache';
import { runExclusively } from '@/lib/in-flight-entities';

/**
 * Flags or unflags a task as a priority, optimistically, for both the row star and the row menu.
 *
 * @param {string} listId - The list whose cached task list is updated
 * @returns {{ togglePriority: (task: object) => Promise<void> }}
 */
export function useTaskPriority(listId) {
    const queryClient = useQueryClient();
    const setPriorityInCache = useCallback(
        (taskId, isPrioritised) => {
            queryClient.setQueryData(['tasks', listId], (currentTasks) =>
                currentTasks?.map((task) =>
                    task.id === taskId ? { ...task, is_prioritised: isPrioritised } : task,
                ),
            );
        },
        [queryClient, listId],
    );

    /**
     * Flips the task's priority flag in the cache at once and undoes it if the save fails.
     * One toggle per task at a time across every star and menu, so rapid taps cannot race each other.
     *
     * @param {object} task - The task whose flag is toggled.
     * @returns {Promise<void>}
     */
    const togglePriority = useCallback(
        (task) =>
            runExclusively(`task-priority:${task.id}`, async () => {
                const wasPrioritised = Boolean(task.is_prioritised);
                setPriorityInCache(task.id, !wasPrioritised);

                try {
                    const { error } = await updateTask(task.id, {
                        is_prioritised: !wasPrioritised,
                    });
                    if (error) {
                        setPriorityInCache(task.id, wasPrioritised);
                        toast.error(error);
                        return;
                    }
                    await queryClient.invalidateQueries({ queryKey: ['tasks', listId] });
                    bustPageCache({ urls: [`/lists/${listId}`] });
                } catch {
                    // A rejected server action means the request never completed (offline, server down)
                    setPriorityInCache(task.id, wasPrioritised);
                    toast.error('Could not update priority. Check your connection and try again.');
                }
            }),
        [queryClient, listId, setPriorityInCache],
    );

    return { togglePriority };
}
