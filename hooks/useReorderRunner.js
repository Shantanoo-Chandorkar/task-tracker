'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { bustPageCache } from '@/lib/cache/service-worker-cache';
import { runExclusively, REORDER_BUSY_MESSAGE } from '@/lib/in-flight-entities';

/**
 * Gives every drag reorder one shared way to save: one at a time per scope, optimistic, with toasts and a refetch.
 *
 * @returns {(reorder: {
 *   scopeKey: string,
 *   queryKey: unknown[],
 *   applyOptimistic: (queryClient: object) => void,
 *   save: () => Promise<string|null>,
 *   failureMessage: string,
 *   successMessage?: string,
 *   bustCache: { urls?: string[], prefixes?: string[] },
 * }) => Promise<void>} Runs one reorder. Only `scopeKey` locks, only `queryKey` reloads.
 *   `save` resolves to a refusal message or null; a throw shows `failureMessage`.
 */
export function useReorderRunner() {
    const queryClient = useQueryClient();

    return useCallback(
        ({
            scopeKey,
            queryKey,
            applyOptimistic,
            save,
            failureMessage,
            successMessage = 'Order updated',
            bustCache,
        }) =>
            runExclusively(
                `reorder:${scopeKey}`,
                async () => {
                    // A reload still in flight would overwrite the new order, so stop it first
                    await queryClient.cancelQueries({ queryKey });
                    applyOptimistic(queryClient);

                    const toastId = toast.loading('Saving order...');
                    async function refreshFromServer() {
                        await queryClient.invalidateQueries({ queryKey });
                        bustPageCache(bustCache);
                    }

                    try {
                        const refusalMessage = await save();
                        if (refusalMessage) {
                            toast.error(refusalMessage, { id: toastId });
                            await refreshFromServer();
                            return;
                        }
                        await refreshFromServer();
                        toast.success(successMessage, { id: toastId });
                    } catch {
                        toast.error(failureMessage, { id: toastId });
                        await refreshFromServer();
                    }
                },
                () => toast.info(REORDER_BUSY_MESSAGE),
            ),
        [queryClient],
    );
}
