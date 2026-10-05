'use client';

import { Loader } from '@/components/custom/Loader';
import { useJoinRequestsQuery } from '@/hooks/useJoinRequestsQuery';
import { useCollaboratorsQuery } from '@/hooks/useCollaboratorsQuery';
import { usePendingInvitesQuery } from '@/hooks/usePendingInvitesQuery';
import { useInviteSender } from '@/hooks/useInviteSender';
import { useSharingRowActions } from '@/hooks/useSharingRowActions';
import { useSharingConfirm } from '@/hooks/useSharingConfirm';
import ShareLinkControls from './sharing/ShareLinkControls';
import InviteByEmailForm from './sharing/InviteByEmailForm';
import PendingInvitesList from './sharing/PendingInvitesList';
import JoinRequestsList from './sharing/JoinRequestsList';
import CollaboratorsList from './sharing/CollaboratorsList';
import SharingConfirmDialog from './sharing/SharingConfirmDialog';

/**
 * Owner-only sharing controls for one space: share the ID/link, review pending requests,
 * manage the current collaborator list.
 *
 * @param {object} props
 * @param {object} props.space - The space these controls belong to
 */
export default function SpaceSharingSection({ space }) {
    const { data: pendingRequests = [], isLoading: isLoadingRequests } = useJoinRequestsQuery(
        space.id,
    );
    const { data: collaborators = [], isLoading: isLoadingCollaborators } = useCollaboratorsQuery(
        space.id,
    );
    const { data: pendingInvites = [], isLoading: isLoadingInvites } = usePendingInvitesQuery(
        space.id,
    );
    const inviteSender = useInviteSender(space.id);
    const rowActions = useSharingRowActions(space.id);
    const sharingConfirm = useSharingConfirm(space.id);

    return (
        <div className="space-y-3">
            <div>
                <h3 className="text-sm font-semibold mb-1">Share this space</h3>
                <ShareLinkControls spaceId={space.id} />
                <InviteByEmailForm inviteSender={inviteSender} />
            </div>

            {(isLoadingRequests || isLoadingCollaborators || isLoadingInvites) && (
                <div className="flex items-center justify-center gap-2 rounded-lg bg-muted/50 py-4 text-xs text-muted-foreground">
                    <Loader size="xs" />
                    Loading invites, requests and collaborators...
                </div>
            )}

            {!isLoadingInvites && pendingInvites.length > 0 && (
                <PendingInvitesList
                    invites={pendingInvites}
                    onRevoke={(inviteId, invitedEmail) =>
                        sharingConfirm.requestConfirm('revoke-invite', inviteId, invitedEmail)
                    }
                />
            )}

            {!isLoadingRequests && pendingRequests.length > 0 && (
                <JoinRequestsList
                    requests={pendingRequests}
                    busyRowKeys={rowActions.busyRowKeys}
                    onApprove={rowActions.handleApprove}
                    onReject={(requestId, requesterEmail) =>
                        sharingConfirm.requestConfirm('reject', requestId, requesterEmail)
                    }
                />
            )}

            {!isLoadingCollaborators && collaborators.length > 0 && (
                <CollaboratorsList
                    collaborators={collaborators}
                    busyRowKeys={rowActions.busyRowKeys}
                    onPermissionChange={rowActions.handlePermissionChange}
                    onRemove={(collaboratorId, email) =>
                        sharingConfirm.requestConfirm('remove', collaboratorId, email)
                    }
                />
            )}

            <SharingConfirmDialog sharingConfirm={sharingConfirm} />
        </div>
    );
}
