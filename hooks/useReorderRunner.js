'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { bustPageCache } from '@/lib/cache/service-worker-cache';
import { runExclusively, REORDER_BUSY_MESSAGE } from '@/lib/in-flight-entities';

/**
 * Gives a list page one shared way to save a drag reorder: one at a time, optimistic, with toasts and a refetch.
 *
 * @param {string} listId - List whose page cache is cleared after each save
 * @returns {(reorder: {
 *   scopeKey: string,
 *   queryKey: unknown[],
 *   applyOptimistic: (queryClient: object) => void,
 *   save: () => Promise<string|null>,
 *   failureMessage: string,
 * }) => Promise<void>} Runs one reorder. `save` resolves to a refusal message, or null when it worked; a throw
 *   counts as a lost connection and shows `failureMessage`. A second reorder in the same scope is turned away
 *   with a toast.
 */
export function useReorderRunner(listId) {
    const queryClient = useQueryClient();

    return useCallback(
        ({ scopeKey, queryKey, applyOptimistic, save, failureMessage }) =>
            runExclusively(
                `reorder:${scopeKey}:${listId}`,
                async () => {
                    // A reload still in flight would overwrite the new order, so stop it first
                    await queryClient.cancelQueries({ queryKey });
                    applyOptimistic(queryClient);

                    const toastId = toast.loading('Saving order...');
                    async function refreshFromServer() {
                        await queryClient.invalidateQueries({ queryKey });
                        bustPageCache({ urls: [`/lists/${listId}`] });
                    }

                    try {
                        const refusalMessage = await save();
                        if (refusalMessage) {
                            toast.error(refusalMessage, { id: toastId });
                            await refreshFromServer();
                            return;
                        }
                        await refreshFromServer();
                        toast.success('Order updated', { id: toastId });
                    } catch {
                        toast.error(failureMessage, { id: toastId });
                        await refreshFromServer();
                    }
                },
                () => toast.info(REORDER_BUSY_MESSAGE),
            ),
        [queryClient, listId],
    );
}
