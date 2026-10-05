'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { sendSpaceInvite } from '@/actions/invite-actions';
import { refetchSpaceSharing } from '@/lib/cache/refetch-space-sharing';
import { UNREACHABLE_TRY_AGAIN_MESSAGE } from '@/lib/ui/unreachable-message';

/**
 * State and submit handler of the "invite by email" form of one space.
 *
 * @param {string} spaceId - Space the invite is for
 * @returns {{
 *   inviteEmail: string,
 *   changeInviteEmail: (newEmail: string) => void,
 *   isSending: boolean,
 *   inviteError: string,
 *   sendInvite: (event: import('react').FormEvent) => Promise<void>,
 * }} `sendInvite` sends once however often the form is submitted; the email is cleared only when the server accepts it.
 */
export function useInviteSender(spaceId) {
    const queryClient = useQueryClient();
    const [inviteEmail, setInviteEmail] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [inviteError, setInviteError] = useState('');

    function changeInviteEmail(newEmail) {
        setInviteEmail(newEmail);
        if (inviteError) setInviteError('');
    }

    async function sendInvite(event) {
        event.preventDefault();
        if (!inviteEmail.trim() || isSending) return;

        setIsSending(true);
        setInviteError('');

        let sendInviteResult;
        try {
            sendInviteResult = await sendSpaceInvite({ spaceId, email: inviteEmail.trim() });
        } catch {
            setIsSending(false);
            setInviteError(UNREACHABLE_TRY_AGAIN_MESSAGE);
            return;
        }
        setIsSending(false);

        if (sendInviteResult.error) {
            setInviteError(sendInviteResult.error);
            return;
        }

        setInviteEmail('');
        toast.success('Invite sent');
        await refetchSpaceSharing(queryClient, spaceId);
    }

    return { inviteEmail, changeInviteEmail, isSending, inviteError, sendInvite };
}
