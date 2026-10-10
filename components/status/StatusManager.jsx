'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useStatusesQuery } from '@/hooks/useStatusesQuery';
import { bustPageCache } from '@/lib/cache/service-worker-cache';
import { createStatus, updateStatus, deleteStatus } from '@/actions/status-actions';
import { reorderStatuses } from '@/actions/reorder-actions';
import LabelManager from '@/components/space-labels/LabelManager';

const STATUS_ACTIONS = {
    create: createStatus,
    update: updateStatus,
    remove: deleteStatus,
    saveOrder: reorderStatuses,
};

/**
 * Says why a status cannot be deleted, so the disabled menu item can show it.
 *
 * @param {{ is_default: boolean, code: string|null }} status - Status to check
 * @param {object[]} statuses - All statuses of the space
 * @returns {string|null} The reason, or null when the status can be deleted
 */
function getStatusDeleteBlockedReason(status, statuses) {
    if (status.is_default) return 'Cannot delete the default status';
    if (status.code) return 'Built-in status - can’t be deleted';
    if (statuses.length === 1) return 'Cannot delete the only status';
    return null;
}

/**
 * Marks the default and built-in statuses next to their name.
 *
 * @param {{ is_default: boolean, code: string|null }} status - Status being shown
 * @returns {import('react').ReactNode} The markers, or nothing for a custom status
 */
function renderStatusBadges(status) {
    return (
        <>
            {status.is_default && (
                <span className="ml-2 text-xs text-muted-foreground">(default)</span>
            )}
            {status.code && <span className="ml-2 text-xs text-muted-foreground">(built-in)</span>}
        </>
    );
}

/**
 * Full status management UI for one space, rendered inline on that space's own card.
 *
 * @param {object} props
 * @param {string} props.spaceId - Space these statuses belong to
 * @param {object[]} [props.initialStatuses] - SSR-fetched statuses, for hydration without a flash
 */
export default function StatusManager({ spaceId, initialStatuses }) {
    const queryClient = useQueryClient();
    const { data: statuses = [], isLoading } = useStatusesQuery(
        spaceId,
        initialStatuses ? { initialData: initialStatuses } : {},
    );

    // Tasks lose the deleted status, so the popup waits for both reloads instead of showing stale groups.
    async function reloadAfterDelete() {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['statuses'] }),
            queryClient.invalidateQueries({ queryKey: ['tasks'] }),
        ]);
        bustPageCache({ prefixes: ['/lists/'] });
    }

    return (
        <LabelManager
            spaceId={spaceId}
            noun="Status"
            resourceKey="statuses"
            heading="Statuses"
            description="Manage the statuses used to organize your tasks. Drag to reorder."
            deleteDescription="Tasks using this status will lose it. This cannot be undone."
            emptyMessage="No statuses in this space yet."
            labels={statuses}
            isLoading={isLoading}
            actions={STATUS_ACTIONS}
            getDeleteBlockedReason={getStatusDeleteBlockedReason}
            renderBadges={renderStatusBadges}
            onLabelDeleted={reloadAfterDelete}
        />
    );
}
