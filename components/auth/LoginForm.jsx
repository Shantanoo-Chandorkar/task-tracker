'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/ui/loader';
import PasswordInput from '@/components/auth/PasswordInput';
import { signInAction } from '@/actions/auth-actions';
import { clearAllCaches } from '@/lib/cache';

/**
 * Email/password login form. On success, clears any stale cached shell from a
 * previous session before navigating - the service worker's page cache isn't
 * keyed by user, so a leftover snapshot could otherwise flash before revalidating.
 */
export default function LoginForm() {
    const router = useRouter();
    const queryClient = useQueryClient();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    async function handleSubmit(event) {
        event.preventDefault();
        if (!email.trim() || !password) return;

        setSubmitting(true);

        let signInResult;
        try {
            signInResult = await signInAction({ email, password });
        } catch {
            // Server Actions reject on a transport failure (offline, server down) - without
            // this catch, submitting would stay true forever with no feedback to the client.
            setSubmitting(false);
            setError('Could not reach the server. Check your connection and try again.');
            return;
        }
        setSubmitting(false);

        if (signInResult.error) {
            setError(signInResult.error);
            return;
        }

        await clearAllCaches(queryClient);
        router.push('/');
        router.refresh();
    }

    return (
        <div className="rounded-lg border border-border bg-card p-6">
            <h1 className="text-lg font-semibold text-foreground">Log in</h1>
            <p className="mt-1 text-sm text-muted-foreground">Welcome back to Task Tracker.</p>

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

                <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                        <label htmlFor="password" className="text-sm font-medium text-foreground">
                            Password
                        </label>
                        <Link
                            href="/forgot-password"
                            className="text-xs font-medium text-muted-foreground underline underline-offset-4"
                        >
                            Forgot password?
                        </Link>
                    </div>
                    <PasswordInput
                        id="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        disabled={submitting}
                    />
                </div>

                {error && <p className="text-xs text-destructive">{error}</p>}

                <Button
                    type="submit"
                    className="w-full gap-1.5"
                    disabled={!email.trim() || !password || submitting}
                >
                    {submitting && <Loader size="xs" />}
                    {submitting ? 'Logging in...' : 'Log in'}
                </Button>
            </form>

            <p className="mt-4 text-center text-sm text-muted-foreground">
                Don&apos;t have an account?{' '}
                <Link
                    href="/signup"
                    className="font-medium text-foreground underline underline-offset-4"
                >
                    Sign up
                </Link>
            </p>
        </div>
    );
}
