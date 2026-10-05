'use client';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatInviteExpiry } from '@/lib/invites/invite-expiry';
import { SharingGroup, SharingRow } from './SharingGroup';

/**
 * Invites sent by email that nobody has accepted yet, each with a Revoke button.
 *
 * @param {object} props
 * @param {object[]} props.invites - Pending invites (`id`, `invited_email`, `expires_at`)
 * @param {(inviteId: string, invitedEmail: string) => void} props.onRevoke - Asks to revoke one invite
 */
export default function PendingInvitesList({ invites, onRevoke }) {
    return (
        <SharingGroup title="Pending invites">
            {invites.map((invite) => (
                <SharingRow key={invite.id}>
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
                        onClick={() => onRevoke(invite.id, invite.invited_email)}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </SharingRow>
            ))}
        </SharingGroup>
    );
}
