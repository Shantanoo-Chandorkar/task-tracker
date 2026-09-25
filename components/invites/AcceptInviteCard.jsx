'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/ui/loader';
import { redeemSpaceInvite } from '@/actions/invite-actions';

/**
 * Signed-in accept step for a space invite -- redeeming only submits a join request, on an
 * explicit click, never as a page-load side effect or as an automatic grant of access.
 *
 * @param {object} props
 * @param {string} props.token - Raw invite token from the URL.
 * @param {string|null} props.spaceName
 */
export default function AcceptInviteCard({ token, spaceName }) {
    const router = useRouter();
    const [status, setStatus] = useState('idle'); // 'idle' | 'submitting' | 'submitted' | 'error'
    const [error, setError] = useState('');

    async function handleAccept() {
        setStatus('submitting');
        setError('');

        let redeemResult;
        try {
            redeemResult = await redeemSpaceInvite({ token });
        } catch {
            setStatus('error');
            setError('Could not reach the server. Check your connection and try again.');
            return;
        }

        if (redeemResult.error) {
            setStatus('error');
            setError(redeemResult.error);
            return;
        }

        setStatus('submitted');
    }

    if (status === 'submitted') {
        return (
            <div className="rounded-lg border border-border bg-card p-6 text-center">
                <h1 className="text-lg font-semibold text-foreground">Request sent</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    The owner of &quot;{spaceName ?? 'this space'}&quot; needs to approve your
                    request before you can access it.
                </p>
                <Button className="mt-6 w-full" onClick={() => router.push('/spaces')}>
                    Go to Spaces
                </Button>
            </div>
        );
    }

    return (
        <div className="rounded-lg border border-border bg-card p-6 text-center">
            <h1 className="text-lg font-semibold text-foreground">
                Join &quot;{spaceName ?? 'this space'}&quot;
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
                Sends a request to join -- the space owner still needs to approve it before you get
                access.
            </p>

            {error && <p className="mt-4 text-xs text-destructive">{error}</p>}

            <Button
                className="mt-6 w-full gap-1.5"
                onClick={handleAccept}
                disabled={status === 'submitting'}
            >
                {status === 'submitting' && <Loader size="xs" />}
                {status === 'submitting' ? 'Sending request...' : 'Request to join'}
            </Button>
        </div>
    );
}
