'use client';

import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/custom/Loader';
import { SharingGroup, SharingRow } from './SharingGroup';

/**
 * People who asked to join the space, each with Approve and Reject buttons.
 *
 * @param {object} props
 * @param {object[]} props.requests - Pending join requests (`id`, `requester_email`)
 * @param {Set<string>} props.busyRowKeys - Row keys that are working, such as `approve:<requestId>`
 * @param {(requestId: string) => void} props.onApprove - Approves one request
 * @param {(requestId: string, requesterEmail: string) => void} props.onReject - Asks to reject one request
 */
export default function JoinRequestsList({ requests, busyRowKeys, onApprove, onReject }) {
    return (
        <SharingGroup title="Pending requests">
            {requests.map((request) => {
                const isApproving = busyRowKeys.has(`approve:${request.id}`);
                return (
                    <SharingRow key={request.id}>
                        <span className="text-sm truncate">{request.requester_email}</span>
                        <div className="flex gap-1 flex-shrink-0">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-emerald-600 hover:text-emerald-700"
                                aria-label="Approve request"
                                disabled={isApproving}
                                onClick={() => onApprove(request.id)}
                            >
                                {isApproving ? <Loader size="xs" /> : <Check className="h-4 w-4" />}
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                aria-label="Reject request"
                                onClick={() => onReject(request.id, request.requester_email)}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </SharingRow>
                );
            })}
        </SharingGroup>
    );
}
