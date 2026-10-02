'use client';

import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { duplicateTask } from '@/actions/task-actions';
import { bustPageCache } from '@/lib/service-worker-cache';

/**
 * Duplicates a task with toast feedback, for both the row menu and the Ctrl/Cmd+D shortcut.
 *
 * @param {string} listId - The list whose cached tasks and counts are refreshed afterwards
 * @returns {{ duplicateTaskById: (taskId: string) => Promise<void> }} Function that duplicates one task by its id.
 */
export function useDuplicateTask(listId) {
    const queryClient = useQueryClient();
    // Blocks a repeat while a copy is in flight, so mashing the shortcut cannot create several copies
    const duplicatingTaskIds = useRef(new Set());

    const duplicateTaskById = useCallback(
        async (taskId) => {
            if (duplicatingTaskIds.current.has(taskId)) return;
            duplicatingTaskIds.current.add(taskId);
            const toastId = toast.loading('Duplicating task...');

            try {
                let duplicateError;
                try {
                    ({ error: duplicateError } = await duplicateTask(taskId));
                } catch {
                    // A rejected server action means the request never completed (offline, server down)
                    toast.error(
                        'Could not reach the server. Check your connection and try again.',
                        {
                            id: toastId,
                        },
                    );
                    return;
                }

                if (duplicateError) {
                    toast.error(duplicateError, { id: toastId });
                    return;
                }

                await queryClient.invalidateQueries({ queryKey: ['tasks', listId] });
                // Duplicating creates a new task, changing the list's total count in ['lists'].
                queryClient.invalidateQueries({ queryKey: ['lists'] });
                bustPageCache({ urls: [`/lists/${listId}`] });
                toast.success('Task duplicated', { id: toastId });
            } finally {
                duplicatingTaskIds.current.delete(taskId);
            }
        },
        [queryClient, listId],
    );

    return { duplicateTaskById };
}
