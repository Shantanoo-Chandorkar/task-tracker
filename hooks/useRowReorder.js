'use client';

import { useCallback } from 'react';
import { planRowReorder } from '@/lib/reorder/plan-row-reorder';
import { replaceRowsInPlace } from '@/lib/reorder/replace-rows-in-place';
import { useReorderRunner } from '@/hooks/useReorderRunner';

/**
 * Reorders one group of sortable rows (spaces, lists, sublists, statuses) by drag or by Move up / Move down.
 *
 * @returns {(reorder: {
 *   groupRows: { id: string }[],
 *   activeId: string,
 *   overId: string,
 *   queryKey: unknown[],
 *   scopeKey: string,
 *   saveOrder: (reorderedRows: object[]) => Promise<string|null>,
 *   bustCache: { urls?: string[], prefixes?: string[] },
 *   failureMessage: string,
 *   successMessage?: string,
 * }) => Promise<void>} Moves `activeId` onto `overId`, shows it in the cache at once, then calls `saveOrder`.
 *   Does nothing when either id is not in `groupRows`. The rest is `useReorderRunner`.
 */
export function useRowReorder() {
    const runReorder = useReorderRunner();

    return useCallback(
        ({
            groupRows,
            activeId,
            overId,
            queryKey,
            scopeKey,
            saveOrder,
            bustCache,
            failureMessage,
            successMessage,
        }) => {
            const reorderPlan = planRowReorder(groupRows, activeId, overId);
            if (!reorderPlan) return Promise.resolve();

            return runReorder({
                scopeKey,
                queryKey,
                applyOptimistic: (queryClient) =>
                    queryClient.setQueryData(queryKey, (cachedRows) =>
                        replaceRowsInPlace(cachedRows, reorderPlan.reorderedRows),
                    ),
                save: () => saveOrder(reorderPlan.reorderedRows),
                failureMessage,
                successMessage,
                bustCache,
            });
        },
        [runReorder],
    );
}
