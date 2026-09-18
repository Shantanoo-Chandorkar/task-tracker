'use client';

import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/ui/loader';
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

    async function refetch() {
        await queryClient.invalidateQueries({ queryKey: ['space-collaborators', space.id] });
        bustPageCache({ urls: ['/spaces'] });
    }

    async function handleApprove(requestId) {
        let result;
        try {
            result = await approveJoinRequest({ requestId });
        } catch {
            toast.error('Could not reach the server. Try again.');
            return;
        }
        if (result.error) {
            toast.error(result.error);
            return;
        }
        toast.success('Request approved');
        await refetch();
    }

    async function handleReject(requestId) {
        let result;
        try {
            result = await rejectJoinRequest({ requestId });
        } catch {
            toast.error('Could not reach the server. Try again.');
            return;
        }
        if (result.error) {
            toast.error(result.error);
            return;
        }
        toast.success('Request rejected');
        await refetch();
    }

    async function handleRemove(collaboratorId) {
        let result;
        try {
            result = await removeCollaborator({ collaboratorId });
        } catch {
            toast.error('Could not reach the server. Try again.');
            return;
        }
        if (result.error) {
            toast.error(result.error);
            return;
        }
        toast.success('Collaborator removed');
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
                                        onClick={() => handleApprove(request.id)}
                                    >
                                        <Check className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-destructive hover:text-destructive"
                                        onClick={() => handleReject(request.id)}
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
                                    onClick={() => handleRemove(collaborator.id)}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
