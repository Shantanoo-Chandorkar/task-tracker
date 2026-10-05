'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { duplicateTask } from '@/actions/task-duplicate-action';
import { bustPageCache } from '@/lib/cache/service-worker-cache';
import { claimInFlight } from '@/lib/in-flight-entities';
import { createClientId } from '@/lib/client-id';

// Copy id per source task: kept after a lost reply so a retry cannot copy twice, cleared once the server answers
const pendingCopyIds = new Map();

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
            const newRootId = pendingCopyIds.get(taskId) ?? createClientId();
            if (newRootId) pendingCopyIds.set(taskId, newRootId);

            try {
                let duplicateError;
                try {
                    ({ error: duplicateError } = await duplicateTask(taskId, newRootId));
                    // The server answered, so the next copy is a new one
                    pendingCopyIds.delete(taskId);
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
