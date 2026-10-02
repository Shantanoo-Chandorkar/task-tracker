'use client';

import { useCallback, useState } from 'react';
import { fetchDeleteCounts } from '@/lib/fetch-delete-counts';
import { claimInFlight } from '@/lib/in-flight-entities';

/**
 * State for a delete confirm dialog that opens at once from cached counts, then corrects them from the server.
 *
 * @returns {{
 *   deleteTarget: object|null,
 *   setDeleteTarget: Function,
 *   requestDelete: (target: object, countsRefresh?: { countsUrl: string, withFreshCounts: Function }) => void,
 * }} `withFreshCounts(target, fetched)` returns the target to show once the server's counts arrive.
 */
export function useDeleteConfirm() {
    const [deleteTarget, setDeleteTarget] = useState(null);

    const requestDelete = useCallback((target, countsRefresh) => {
        setDeleteTarget(target);
        if (!countsRefresh) return;

        const releaseInFlight = claimInFlight(`delete-counts:${target.id}`);
        if (!releaseInFlight) return;
        // Failure is ignored: the cached counts stay, and the confirm itself still reaches the server.
        fetchDeleteCounts(countsRefresh.countsUrl)
            .then((fetchedCounts) => {
                if (!fetchedCounts) return;
                setDeleteTarget((openTarget) =>
                    openTarget?.id === target.id
                        ? countsRefresh.withFreshCounts(openTarget, fetchedCounts)
                        : openTarget,
                );
            })
            .catch(() => {})
            .finally(releaseInFlight);
    }, []);

    return { deleteTarget, setDeleteTarget, requestDelete };
}
