'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import ResponsiveModal from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader } from '@/components/ui/loader';
import { requestToJoinSpace } from '@/actions/collaboration-actions';

/**
 * Modal for requesting to join a space by ID. Pre-fills from a shared join link if provided.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {Function} props.onClose
 * @param {string} [props.initialSpaceId] - Pre-filled space ID from a `?join=` link
 */
export default function JoinSpaceDialog({ open, onClose, initialSpaceId = '' }) {
    const [spaceId, setSpaceId] = useState(initialSpaceId);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    // Reset the form whenever the dialog (re)opens with a new prefill -- adjusting state
    // during render, not in an effect, matches useColorNameForm's established reset pattern.
    const resetKey = open ? initialSpaceId : null;
    const [lastResetKey, setLastResetKey] = useState(resetKey);
    if (resetKey !== lastResetKey) {
        setLastResetKey(resetKey);
        if (open) {
            setSpaceId(initialSpaceId);
            setError('');
        }
    }

    async function handleSubmit(event) {
        event.preventDefault();
        setSubmitting(true);
        setError('');

        let joinResult;
        try {
            joinResult = await requestToJoinSpace({ spaceId: spaceId.trim() });
        } catch {
            setSubmitting(false);
            setError('Could not reach the server. Check your connection and try again.');
            return;
        }
        setSubmitting(false);

        if (joinResult.error) {
            setError(joinResult.error);
            return;
        }

        toast.success('Request sent — the owner will be notified.');
        onClose();
    }

    return (
        <ResponsiveModal open={open} onClose={onClose} title="Join a space">
            <form onSubmit={handleSubmit} className="space-y-4 mt-2">
                <Input
                    value={spaceId}
                    onChange={(event) => setSpaceId(event.target.value)}
                    placeholder="Paste the space ID"
                    autoFocus
                    disabled={submitting}
                />
                {error && <p className="text-xs text-destructive">{error}</p>}

                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={!spaceId.trim() || submitting} className="gap-1.5">
                        {submitting && <Loader size="xs" />}
                        {submitting ? 'Sending...' : 'Request to join'}
                    </Button>
                </div>
            </form>
        </ResponsiveModal>
    );
}
