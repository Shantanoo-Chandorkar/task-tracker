'use client';

import { useId, useState } from 'react';
import { toast } from 'sonner';
import ModalShell from '@/components/ui/modal-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader } from '@/components/ui/loader';
import LabeledField from '@/components/ui/LabeledField';
import FormError from '@/components/ui/FormError';
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
    const formId = useId();
    const [spaceId, setSpaceId] = useState(initialSpaceId);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const errorId = useId();

    // Reset the form whenever the dialog (re)opens with a new prefill -- adjusting state
    // during render, not in an effect, matches useColorNameForm's established reset pattern.
    const resetKey = open ? initialSpaceId : null;
    const [lastResetKey, setLastResetKey] = useState(resetKey);
    if (resetKey !== lastResetKey) {
        setLastResetKey(resetKey);
        if (open) {
            setSpaceId(initialSpaceId);
            setError('');
            setSubmitting(false);
        }
    }

    async function handleSubmit(event) {
        event.preventDefault();
        if (submitting) return;
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

        if (joinResult.error) {
            setSubmitting(false);
            setError(joinResult.error);
            return;
        }

        // No unlock on success: the dialog stays on screen while it animates out, and the next open resets it.
        toast.success('Request sent - the owner will be notified.');
        onClose();
    }

    return (
        <ModalShell
            open={open}
            onClose={onClose}
            isBusy={submitting}
            title="Join a space"
            footer={
                <>
                    <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        form={formId}
                        disabled={!spaceId.trim() || submitting}
                        className="gap-1.5"
                    >
                        {submitting && <Loader size="xs" />}
                        {submitting ? 'Sending...' : 'Request to join'}
                    </Button>
                </>
            }
        >
            <form id={formId} onSubmit={handleSubmit} className="space-y-4 mt-2">
                <LabeledField label="Space ID">
                    {({ controlId }) => (
                        <Input
                            id={controlId}
                            value={spaceId}
                            onChange={(event) => setSpaceId(event.target.value)}
                            placeholder="Paste the space ID"
                            autoFocus
                            disabled={submitting}
                            aria-invalid={error ? true : undefined}
                            aria-describedby={error ? errorId : undefined}
                        />
                    )}
                </LabeledField>
                <FormError errorId={errorId}>{error}</FormError>
            </form>
        </ModalShell>
    );
}
