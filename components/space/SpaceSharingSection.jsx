'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/ui/loader';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { bustPageCache } from '@/lib/service-worker-cache';
import { useJoinRequestsQuery } from '@/hooks/useJoinRequestsQuery';
import { useCollaboratorsQuery } from '@/hooks/useCollaboratorsQuery';
import {
    approveJoinRequest,
    rejectJoinRequest,
    removeCollaborator,
} from '@/actions/collaboration-actions';

async function copyToClipboard(text, label) {
    try {
        await navigator.clipboard.writeText(text);
        toast.success(`${label} copied`);
    } catch {
        toast.error(`Could not copy ${label.toLowerCase()}`);
    }
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
    const { data: pendingRequests = [], isLoading: isLoadingRequests } = useJoinRequestsQuery(space.id);
    const { data: collaborators = [], isLoading: isLoadingCollaborators } = useCollaboratorsQuery(space.id);
    // { action: 'reject'|'remove', targetId, label } while a confirm dialog is open, else null.
    const [confirmTarget, setConfirmTarget] = useState(null);
    const [confirming, setConfirming] = useState(false);

    async function refetch() {
        await queryClient.invalidateQueries({ queryKey: ['space-collaborators', space.id] });
        bustPageCache({ urls: ['/spaces'] });
    }

    async function handleApprove(requestId) {
        const toastId = toast.loading('Approving...');
        let result;
        try {
            result = await approveJoinRequest({ requestId });
        } catch {
            toast.error('Could not reach the server. Try again.', { id: toastId });
            return;
        }
        if (result.error) {
            toast.error(result.error, { id: toastId });
            return;
        }
        toast.success('Request approved', { id: toastId });
        await refetch();
    }

    async function handleConfirm() {
        if (!confirmTarget) return;
        const { action, targetId } = confirmTarget;

        setConfirming(true);
        const toastId = toast.loading(action === 'reject' ? 'Rejecting...' : 'Removing...');

        let result;
        try {
            result =
                action === 'reject'
                    ? await rejectJoinRequest({ requestId: targetId })
                    : await removeCollaborator({ collaboratorId: targetId });
        } catch {
            setConfirming(false);
            setConfirmTarget(null);
            toast.error('Could not reach the server. Try again.', { id: toastId });
            return;
        }
        setConfirming(false);
        setConfirmTarget(null);

        if (result.error) {
            toast.error(result.error, { id: toastId });
            return;
        }
        toast.success(action === 'reject' ? 'Request rejected' : 'Collaborator removed', {
            id: toastId,
        });
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
                        copyToClipboard(`${window.location.origin}/spaces?join=${space.id}`, 'Join link')
                    }
                >
                    <Copy className="h-3.5 w-3.5" />
                    Copy join link
                </Button>
            </div>

            {(isLoadingRequests || isLoadingCollaborators) && (
                <div className="flex items-center justify-center gap-2 rounded-lg bg-muted/50 py-4 text-xs text-muted-foreground">
                    <Loader size="xs" />
                    Loading requests and collaborators...
                </div>
            )}

            {!isLoadingRequests && pendingRequests.length > 0 && (
                <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Pending requests</p>
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
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Collaborators</p>
                    <div className="rounded-lg bg-muted/50 divide-y divide-border">
                        {collaborators.map((collaborator) => (
                            <div
                                key={collaborator.id}
                                className="flex items-center justify-between gap-2 px-3 py-2"
                            >
                                <span className="text-sm truncate">{collaborator.requester_email}</span>
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
                        ))}
                    </div>
                </div>
            )}

            <AlertDialog
                open={!!confirmTarget}
                onOpenChange={(open) => !open && setConfirmTarget(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {confirmTarget?.action === 'reject'
                                ? `Reject request from "${confirmTarget?.label}"?`
                                : `Remove "${confirmTarget?.label}" from this space?`}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {confirmTarget?.action === 'reject'
                                ? "They'll need to send a new request to join."
                                : "They'll lose access to this space's lists and tasks."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setConfirmTarget(null)}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirm}
                            disabled={confirming}
                            className="gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {confirming && <Loader size="xs" />}
                            {confirmTarget?.action === 'reject' ? 'Reject' : 'Remove'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
