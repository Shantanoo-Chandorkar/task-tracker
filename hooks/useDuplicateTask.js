'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { duplicateTask } from '@/actions/task-actions';
import { bustPageCache } from '@/lib/service-worker-cache';
import { claimInFlight } from '@/lib/in-flight-entities';

/**
 * Duplicates a task with toast feedback, for both the row menu and the Ctrl/Cmd+D shortcut.
 *
 * @param {string} listId - The list whose cached tasks and counts are refreshed afterwards
 * @returns {{ duplicateTaskById: (taskId: string) => Promise<void> }} Function that duplicates one task by its id.
 */
export function useDuplicateTask(listId) {
    const queryClient = useQueryClient();
    const duplicateTaskById = useCallback(
        async (taskId) => {
            // Shared across menu and shortcut instances, so mashing either cannot create several copies
            const releaseInFlight = claimInFlight(`task-duplicate:${taskId}`);
            if (!releaseInFlight) return;
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
                releaseInFlight();
            }
        },
        [queryClient, listId],
    );

    return { duplicateTaskById };
}
