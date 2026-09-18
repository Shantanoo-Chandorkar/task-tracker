'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/ui/loader';
import PasswordInput from '@/components/auth/PasswordInput';
import { updatePasswordAction } from '@/actions/auth-actions';
import { clearAllCaches } from '@/lib/cache';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Sets a new password for the recovery session /auth/confirm already established.
 * Only rendered when a valid session exists — see app/(auth)/reset-password/page.js.
 */
export default function ResetPasswordForm() {
    const router = useRouter();
    const queryClient = useQueryClient();

    const [password, setPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    async function handleSubmit(event) {
        event.preventDefault();
        if (password.length < MIN_PASSWORD_LENGTH) return;

        setSubmitting(true);

        let updateResult;
        try {
            updateResult = await updatePasswordAction({ newPassword: password });
        } catch {
            setSubmitting(false);
            setError('Could not reach the server. Check your connection and try again.');
            return;
        }
        setSubmitting(false);

        if (updateResult.error) {
            setError(updateResult.error);
            return;
        }

        // /auth/confirm already established this session -- bust the cache same as LoginForm does.
        await clearAllCaches(queryClient);
        toast.info('Password updated. Log in with your new password.');
        router.push('/login');
        router.refresh();
    }

    return (
        <div className="rounded-lg border border-border bg-card p-6">
            <h1 className="text-lg font-semibold text-foreground">Reset password</h1>
            <p className="mt-1 text-sm text-muted-foreground">Choose a new password.</p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div className="space-y-1.5">
                    <label htmlFor="password" className="text-sm font-medium text-foreground">
                        New password
                    </label>
                    <PasswordInput
                        id="password"
                        autoComplete="new-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        disabled={submitting}
                        autoFocus
                    />
                    <p className="text-xs text-muted-foreground">
                        At least {MIN_PASSWORD_LENGTH} characters.
                    </p>
                </div>

                {error && <p className="text-xs text-destructive">{error}</p>}

                <Button
                    type="submit"
                    className="w-full gap-1.5"
                    disabled={password.length < MIN_PASSWORD_LENGTH || submitting}
                >
                    {submitting && <Loader size="xs" />}
                    {submitting ? 'Updating...' : 'Update password'}
                </Button>
            </form>
        </div>
    );
}
