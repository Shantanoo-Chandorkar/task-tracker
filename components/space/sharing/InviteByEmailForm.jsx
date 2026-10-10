'use client';

import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader } from '@/components/custom/Loader';

/**
 * Email field and Send button for inviting someone to a space.
 *
 * @param {object} props
 * @param {object} props.inviteSender - Result of `useInviteSender`
 */
export default function InviteByEmailForm({ inviteSender }) {
    const { inviteEmail, changeInviteEmail, isSending, inviteError, sendInvite } = inviteSender;

    return (
        <form onSubmit={sendInvite} className="mt-3 flex items-start gap-1.5">
            <div className="flex-1">
                <Input
                    type="email"
                    placeholder="Invite by email"
                    className="h-8 text-sm"
                    value={inviteEmail}
                    onChange={(event) => changeInviteEmail(event.target.value)}
                    disabled={isSending}
                    aria-label="Invite by email"
                />
                {inviteError && <p className="mt-1 text-xs text-destructive">{inviteError}</p>}
            </div>
            <Button
                type="submit"
                size="sm"
                className="h-8 gap-1.5"
                disabled={!inviteEmail.trim() || isSending}
            >
                {isSending ? <Loader size="xs" /> : <Send className="h-3.5 w-3.5" />}
                Send
            </Button>
        </form>
    );
}
