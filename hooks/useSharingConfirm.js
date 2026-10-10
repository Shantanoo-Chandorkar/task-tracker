'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { rejectJoinRequest, removeCollaborator } from '@/actions/collaboration-actions';
import { revokeSpaceInvite } from '@/actions/invite-actions';
import { removeRowFromCache } from '@/lib/cache/query-cache';
import { refetchSpaceSharing } from '@/lib/cache/refetch-space-sharing';
import { getSharingToasts } from '@/lib/spaces/sharing-confirm-copy';
import { useConfirmAction } from '@/hooks/useConfirmAction';

/**
 * The confirm popup state and the work behind rejecting a request, removing a collaborator and revoking an invite.
 *
 * @param {string} spaceId - Space the rows belong to
 * @returns {{
 *   confirmTarget: { action: 'reject'|'remove'|'revoke-invite', targetId: string, label: string }|null,
 *   requestConfirm: (action: string, targetId: string, label: string) => void,
 *   closeConfirm: () => void,
 *   confirm: () => Promise<boolean>|undefined,
 *   isPending: boolean,
 *   errorMessage: string,
 * }} `confirm` closes the popup only once the row is gone from the screen.
 */
export function useSharingConfirm(spaceId) {
    const queryClient = useQueryClient();
    const [confirmTarget, setConfirmTarget] = useState(null);
    const sharingConfirm = useConfirmAction(Boolean(confirmTarget));

    function requestConfirm(action, targetId, label) {
        setConfirmTarget({ action, targetId, label });
    }

    function closeConfirm() {
        setConfirmTarget(null);
    }

    function runConfirmedServerCall({ action, targetId }) {
        if (action === 'reject') return rejectJoinRequest({ requestId: targetId });
        if (action === 'remove') return removeCollaborator({ collaboratorId: targetId });
        return revokeSpaceInvite({ inviteId: targetId });
    }

    function confirm() {
        if (!confirmTarget) return;
        const { action, targetId } = confirmTarget;
        const { loadingMessage, successMessage } = getSharingToasts(action);

        return sharingConfirm.runConfirmedAction({
            entityKey: `${action}:${targetId}`,
            loadingMessage,
            successMessage,
            action: () => runConfirmedServerCall(confirmTarget),
            // The row leaves the list at once, so the popup closes onto the final screen; the reload is quiet.
            onSuccess: () => {
                removeRowFromCache(queryClient, ['space-collaborators', spaceId], targetId);
                removeRowFromCache(queryClient, ['space-invites', spaceId], targetId);
                refetchSpaceSharing(queryClient, spaceId);
            },
            close: closeConfirm,
        });
    }

    return {
        confirmTarget,
        requestConfirm,
        closeConfirm,
        confirm,
        isPending: sharingConfirm.isPending,
        errorMessage: sharingConfirm.errorMessage,
    };
}
