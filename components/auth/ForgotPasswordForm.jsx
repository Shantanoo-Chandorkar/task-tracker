'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/ui/loader';
import { requestPasswordResetAction } from '@/actions/auth-actions';

const GENERIC_SENT_MESSAGE = 'If an account exists for that email, a reset link is on its way.';
const DELAY_NOTICE =
    "It can occasionally take up to 2 hours to arrive - check back if it's not in your inbox yet.";

/**
 * Requests a password-reset email. Deliberately shows the same message whether or not the
 * account exists - the server action never reveals that distinction (account enumeration).
 */
export default function ForgotPasswordForm() {
    const [email, setEmail] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [isSent, setIsSent] = useState(false);

    async function handleSubmit(event) {
        event.preventDefault();
        if (!email.trim()) return;

        setSubmitting(true);

        let resetRequestResult;
        try {
            resetRequestResult = await requestPasswordResetAction({ email });
        } catch {
            setSubmitting(false);
            setError('Could not reach the server. Check your connection and try again.');
            return;
        }
        setSubmitting(false);

        if (resetRequestResult.error) {
            setError(resetRequestResult.error);
            return;
        }

        setIsSent(true);
    }

    return (
        <div className="rounded-lg border border-border bg-card p-6">
            <h1 className="text-lg font-semibold text-foreground">Forgot password</h1>
            <p className="mt-1 text-sm text-muted-foreground">
                Enter your email and we&apos;ll send you a reset link.
            </p>

            {isSent ? (
                <div className="mt-6 space-y-1.5">
                    <p className="text-sm text-foreground">{GENERIC_SENT_MESSAGE}</p>
                    <p className="text-xs text-muted-foreground">{DELAY_NOTICE}</p>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                    <div className="space-y-1.5">
                        <label htmlFor="email" className="text-sm font-medium text-foreground">
                            Email
                        </label>
                        <Input
                            id="email"
                            type="email"
                            autoComplete="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            disabled={submitting}
                            autoFocus
                        />
                    </div>

                    {error && <p className="text-xs text-destructive">{error}</p>}

                    <Button
                        type="submit"
                        className="w-full gap-1.5"
                        disabled={!email.trim() || submitting}
                    >
                        {submitting && <Loader size="xs" />}
                        {submitting ? 'Sending...' : 'Send reset link'}
                    </Button>
                </form>
            )}

            <p className="mt-4 text-center text-sm text-muted-foreground">
                <Link
                    href="/login"
                    className="font-medium text-foreground underline underline-offset-4"
                >
                    Back to log in
                </Link>
            </p>
        </div>
    );
}
