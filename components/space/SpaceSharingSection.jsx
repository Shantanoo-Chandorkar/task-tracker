'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, Check, X, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader } from '@/components/ui/loader';
import { AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import ModalShell from '@/components/ui/modal-shell';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { bustPageCache } from '@/lib/service-worker-cache';
import { useJoinRequestsQuery } from '@/hooks/useJoinRequestsQuery';
import { useCollaboratorsQuery } from '@/hooks/useCollaboratorsQuery';
import { usePendingInvitesQuery } from '@/hooks/usePendingInvitesQuery';
import {
    approveJoinRequest,
    rejectJoinRequest,
    removeCollaborator,
    updateCollaboratorPermission,
} from '@/actions/collaboration-actions';
import { sendSpaceInvite, revokeSpaceInvite } from '@/actions/invite-actions';
import { PERMISSION_LEVEL_LABELS } from '@/lib/permissions/space-permissions';

const DAY_MS = 24 * 60 * 60 * 1000;

async function copyToClipboard(text, label) {
    try {
        await navigator.clipboard.writeText(text);
        toast.success(`${label} copied`);
    } catch {
        toast.error(`Could not copy ${label.toLowerCase()}`);
    }
}

/**
 * Renders how long until an invite expires, or that it already has -- a display-only label; the
 * server is the actual source of truth for whether an expired invite can still be redeemed.
 *
 * @param {string} expiresAt - ISO timestamp.
 * @returns {string} e.g. "Expires in 3 days" or "Expired".
 */
function formatInviteExpiry(expiresAt) {
    const daysLeft = Math.ceil((Date.parse(expiresAt) - Date.now()) / DAY_MS);
    if (daysLeft <= 0) return 'Expired';
    return `Expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
}

/**
 * Owner-only sharing controls for one space: share the ID/link, review pending requests,
 * manage the current collaborator list.
 *
 * @param {object} props
 * @param {object} props.space - The space these controls belong to
 */
export default function SpaceSharingSection({ space }) {
    const queryClient = useQueryClient();
    const { data: pendingRequests = [], isLoading: isLoadingRequests } = useJoinRequestsQuery(
        space.id,
    );
    const { data: collaborators = [], isLoading: isLoadingCollaborators } = useCollaboratorsQuery(
        space.id,
    );
    const { data: pendingInvites = [], isLoading: isLoadingInvites } = usePendingInvitesQuery(
        space.id,
    );
    // { action: 'reject'|'remove'|'revoke-invite', targetId, label } while a confirm dialog is open, else null.
    const [confirmTarget, setConfirmTarget] = useState(null);
    const [confirming, setConfirming] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [sendingInvite, setSendingInvite] = useState(false);
    const [inviteError, setInviteError] = useState('');

    async function refetch() {
        await queryClient.invalidateQueries({ queryKey: ['space-collaborators', space.id] });
        await queryClient.invalidateQueries({ queryKey: ['space-invites', space.id] });
        bustPageCache({ urls: ['/spaces'] });
    }

    async function handleSendInvite(event) {
        event.preventDefault();
        if (!inviteEmail.trim() || sendingInvite) return;

        setSendingInvite(true);
        setInviteError('');

        let sendInviteResult;
        try {
            sendInviteResult = await sendSpaceInvite({
                spaceId: space.id,
                email: inviteEmail.trim(),
            });
        } catch {
            setSendingInvite(false);
            setInviteError('Could not reach the server. Try again.');
            return;
        }
        setSendingInvite(false);

        if (sendInviteResult.error) {
            setInviteError(sendInviteResult.error);
            return;
        }

        setInviteEmail('');
        toast.success('Invite sent');
        await refetch();
    }

    async function handleApprove(requestId) {
        const toastId = toast.loading('Approving...');
        let approveResult;
        try {
            approveResult = await approveJoinRequest({ requestId });
        } catch {
            toast.error('Could not reach the server. Try again.', { id: toastId });
            return;
        }
        if (approveResult.error) {
            toast.error(approveResult.error, { id: toastId });
            return;
        }
        toast.success('Request approved', { id: toastId });
        await refetch();
    }

    async function handleConfirm() {
        if (!confirmTarget) return;
        const { action, targetId } = confirmTarget;

        setConfirming(true);
        const loadingLabelByAction = {
            reject: 'Rejecting...',
            remove: 'Removing...',
            'revoke-invite': 'Revoking...',
        };
        const toastId = toast.loading(loadingLabelByAction[action]);

        let actionResult;
        try {
            if (action === 'reject') {
                actionResult = await rejectJoinRequest({ requestId: targetId });
            } else if (action === 'remove') {
                actionResult = await removeCollaborator({ collaboratorId: targetId });
            } else {
                actionResult = await revokeSpaceInvite({ inviteId: targetId });
            }
        } catch {
            setConfirming(false);
            setConfirmTarget(null);
            toast.error('Could not reach the server. Try again.', { id: toastId });
            return;
        }
        setConfirming(false);
        setConfirmTarget(null);

        if (actionResult.error) {
            toast.error(actionResult.error, { id: toastId });
            return;
        }
        const successLabelByAction = {
            reject: 'Request rejected',
            remove: 'Collaborator removed',
            'revoke-invite': 'Invite revoked',
        };
        toast.success(successLabelByAction[action], { id: toastId });
        await refetch();
    }

    async function handlePermissionChange(collaboratorId, newPermissionLevel) {
        const toastId = toast.loading('Updating permission...');
        let permissionResult;
        try {
            permissionResult = await updateCollaboratorPermission({
                collaboratorId,
                permissionLevel: newPermissionLevel,
            });
        } catch {
            toast.error('Could not reach the server. Try again.', { id: toastId });
            return;
        }
        if (permissionResult.error) {
            toast.error(permissionResult.error, { id: toastId });
            return;
        }
        toast.success('Permission updated', { id: toastId });
        await refetch();
    }

    return (
        <div className="space-y-3">
            <div>
                <h3 className="text-sm font-semibold mb-1">Share this space</h3>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="truncate font-mono">{space.id}</span>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 flex-shrink-0"
                        aria-label="Copy space ID"
                        onClick={() => copyToClipboard(space.id, 'Space ID')}
                    >
                        <Copy className="h-3 w-3" />
                    </Button>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 gap-1.5"
                    onClick={() =>
                        copyToClipboard(
                            `${window.location.origin}/spaces?join=${space.id}`,
                            'Join link',
                        )
                    }
                >
                    <Copy className="h-3.5 w-3.5" />
                    Copy join link
                </Button>

                <form onSubmit={handleSendInvite} className="mt-3 flex items-start gap-1.5">
                    <div className="flex-1">
                        <Input
                            type="email"
                            placeholder="Invite by email"
                            className="h-8 text-sm"
                            value={inviteEmail}
                            onChange={(event) => {
                                setInviteEmail(event.target.value);
                                if (inviteError) setInviteError('');
                            }}
                            disabled={sendingInvite}
                            aria-label="Invite by email"
                        />
                        {inviteError && (
                            <p className="mt-1 text-xs text-destructive">{inviteError}</p>
                        )}
                    </div>
                    <Button
                        type="submit"
                        size="sm"
                        className="h-8 gap-1.5"
                        disabled={!inviteEmail.trim() || sendingInvite}
                    >
                        {sendingInvite ? <Loader size="xs" /> : <Send className="h-3.5 w-3.5" />}
                        Send
                    </Button>
                </form>
            </div>

            {(isLoadingRequests || isLoadingCollaborators || isLoadingInvites) && (
                <div className="flex items-center justify-center gap-2 rounded-lg bg-muted/50 py-4 text-xs text-muted-foreground">
                    <Loader size="xs" />
                    Loading invites, requests and collaborators...
                </div>
            )}

            {!isLoadingInvites && pendingInvites.length > 0 && (
                <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">
                        Pending invites
                    </p>
                    <div className="rounded-lg bg-muted/50 divide-y divide-border">
                        {pendingInvites.map((invite) => (
                            <div
                                key={invite.id}
                                className="flex items-center justify-between gap-2 px-3 py-2"
                            >
                                <div className="min-w-0">
                                    <p className="text-sm truncate">{invite.invited_email}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {formatInviteExpiry(invite.expires_at)}
                                    </p>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
                                    aria-label="Revoke invite"
                                    onClick={() =>
                                        setConfirmTarget({
                                            action: 'revoke-invite',
                                            targetId: invite.id,
                                            label: invite.invited_email,
                                        })
                                    }
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {!isLoadingRequests && pendingRequests.length > 0 && (
                <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">
                        Pending requests
                    </p>
                    <div className="rounded-lg bg-muted/50 divide-y divide-border">
                        {pendingRequests.map((request) => (
                            <div
                                key={request.id}
                                className="flex items-center justify-between gap-2 px-3 py-2"
                            >
                                <span className="text-sm truncate">{request.requester_email}</span>
                                <div className="flex gap-1 flex-shrink-0">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-emerald-600 hover:text-emerald-700"
                                        aria-label="Approve request"
                                        onClick={() => handleApprove(request.id)}
                                    >
                                        <Check className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-destructive hover:text-destructive"
                                        aria-label="Reject request"
                                        onClick={() =>
                                            setConfirmTarget({
                                                action: 'reject',
                                                targetId: request.id,
                                                label: request.requester_email,
                                            })
                                        }
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {!isLoadingCollaborators && collaborators.length > 0 && (
                <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">
                        Collaborators
                    </p>
                    <div className="rounded-lg bg-muted/50 divide-y divide-border">
                        {collaborators.map((collaborator) => (
                            <div
                                key={collaborator.id}
                                className="flex items-center justify-between gap-2 px-3 py-2"
                            >
                                <span className="text-sm truncate">
                                    {collaborator.requester_email}
                                </span>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    <Select
                                        value={collaborator.permission_level}
                                        onValueChange={(newPermissionLevel) =>
                                            handlePermissionChange(
                                                collaborator.id,
                                                newPermissionLevel,
                                            )
                                        }
                                    >
                                        <SelectTrigger
                                            className="h-7 w-auto text-xs"
                                            aria-label={`Permission for ${collaborator.requester_email}`}
                                        >
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {Object.entries(PERMISSION_LEVEL_LABELS).map(
                                                ([level, label]) => (
                                                    <SelectItem key={level} value={level}>
                                                        {label}
                                                    </SelectItem>
                                                ),
                                            )}
                                        </SelectContent>
                                    </Select>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                        aria-label="Remove collaborator"
                                        onClick={() =>
                                            setConfirmTarget({
                                                action: 'remove',
                                                targetId: collaborator.id,
                                                label: collaborator.requester_email,
                                            })
                                        }
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <ModalShell
                open={!!confirmTarget}
                onClose={() => setConfirmTarget(null)}
                variant="alert"
                title={
                    {
                        reject: `Reject request from "${confirmTarget?.label}"?`,
                        remove: `Remove "${confirmTarget?.label}" from this space?`,
                        'revoke-invite': `Revoke the invite sent to "${confirmTarget?.label}"?`,
                    }[confirmTarget?.action]
                }
                description={
                    {
                        reject: "They'll need to send a new request to join.",
                        remove: "They'll lose access to this space's lists and tasks.",
                        'revoke-invite': 'The link in their email will stop working.',
                    }[confirmTarget?.action]
                }
                footer={
                    <>
                        <AlertDialogCancel onClick={() => setConfirmTarget(null)}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirm}
                            disabled={confirming}
                            className="gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {confirming && <Loader size="xs" />}
                            {
                                { reject: 'Reject', remove: 'Remove', 'revoke-invite': 'Revoke' }[
                                    confirmTarget?.action
                                ]
                            }
                        </AlertDialogAction>
                    </>
                }
            />
        </div>
    );
}
