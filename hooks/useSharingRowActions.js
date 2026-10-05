'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { approveJoinRequest, updateCollaboratorPermission } from '@/actions/collaboration-actions';
import { refetchSpaceSharing } from '@/lib/cache/refetch-space-sharing';
import { runExclusively } from '@/lib/in-flight-entities';
import { UNREACHABLE_TRY_AGAIN_MESSAGE } from '@/lib/ui/unreachable-message';

/**
 * Runs a server call behind a loading toast, then shows the refusal or the success message.
 *
 * @param {{ loadingMessage: string, successMessage: string, call: () => Promise<{ error: string|null }> }} work
 * @returns {Promise<boolean>} True when the server accepted it; a throw is shown as a lost connection
 */
async function callWithToasts({ loadingMessage, successMessage, call }) {
    const toastId = toast.loading(loadingMessage);
    let callResult;
    try {
        callResult = await call();
    } catch {
        toast.error(UNREACHABLE_TRY_AGAIN_MESSAGE, { id: toastId });
        return false;
    }
    if (callResult.error) {
        toast.error(callResult.error, { id: toastId });
        return false;
    }
    toast.success(successMessage, { id: toastId });
    return true;
}

/**
 * Row-level actions of a space's sharing panel that need no confirm popup: approving a request and changing a
 * collaborator's permission. Each row works one at a time and is marked busy meanwhile.
 *
 * @param {string} spaceId - Space the rows belong to
 * @returns {{
 *   busyRowKeys: Set<string>,
 *   handleApprove: (requestId: string) => Promise<void>,
 *   handlePermissionChange: (collaboratorId: string, newPermissionLevel: string) => Promise<void>,
 * }} Keys in `busyRowKeys` look like `approve:<requestId>` and `permission:<collaboratorId>`.
 */
export function useSharingRowActions(spaceId) {
    const queryClient = useQueryClient();
    const [busyRowKeys, setBusyRowKeys] = useState(() => new Set());

    /**
     * Runs one row's action once at a time and marks that row busy while it works.
     *
     * @param {string} rowKey - Key such as `approve:<requestId>`, also used to disable that row's control.
     * @param {() => Promise<*>} work - The row's async action.
     * @returns {Promise<*>} What `work` returned, or undefined when the row was already busy.
     */
    function runRowAction(rowKey, work) {
        return runExclusively(rowKey, async () => {
            setBusyRowKeys((current) => new Set(current).add(rowKey));
            try {
                return await work();
            } finally {
                setBusyRowKeys((current) => {
                    const remaining = new Set(current);
                    remaining.delete(rowKey);
                    return remaining;
                });
            }
        });
    }

    function handleApprove(requestId) {
        return runRowAction(`approve:${requestId}`, async () => {
            const wasApproved = await callWithToasts({
                loadingMessage: 'Approving...',
                successMessage: 'Request approved',
                call: () => approveJoinRequest({ requestId }),
            });
            if (!wasApproved) return;
            // Awaited so the button keeps spinning until the person shows up in the collaborators list.
            await refetchSpaceSharing(queryClient, spaceId);
        });
    }

    function handlePermissionChange(collaboratorId, newPermissionLevel) {
        return runRowAction(`permission:${collaboratorId}`, async () => {
            const wasUpdated = await callWithToasts({
                loadingMessage: 'Updating permission...',
                successMessage: 'Permission updated',
                call: () =>
                    updateCollaboratorPermission({
                        collaboratorId,
                        permissionLevel: newPermissionLevel,
                    }),
            });
            if (!wasUpdated) return;
            // The Select shows the new level at once; the reload only reconciles in the background.
            queryClient.setQueriesData(
                { queryKey: ['space-collaborators', spaceId] },
                (cachedRows) =>
                    Array.isArray(cachedRows)
                        ? cachedRows.map((row) =>
                              row.id === collaboratorId
                                  ? { ...row, permission_level: newPermissionLevel }
                                  : row,
                          )
                        : cachedRows,
            );
            refetchSpaceSharing(queryClient, spaceId);
        });
    }

    return { busyRowKeys, handleApprove, handlePermissionChange };
}
