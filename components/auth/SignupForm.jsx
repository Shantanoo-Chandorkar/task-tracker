'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/ui/loader';
import PasswordInput from '@/components/auth/PasswordInput';
import { signUpAction, signInAction } from '@/actions/auth-actions';
import { clearAllCaches } from '@/lib/cache';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Email/password signup form. Email confirmation is disabled for this project, so a
 * successful signup immediately signs the account in and lands on the first-list page.
 */
export default function SignupForm() {
    const router = useRouter();
    const queryClient = useQueryClient();

    const [displayName, setDisplayName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const isValid = displayName.trim() && email.trim() && password.length >= MIN_PASSWORD_LENGTH;

    async function handleSubmit(event) {
        event.preventDefault();
        if (!isValid) return;

        setSubmitting(true);

        let signUpResult;
        try {
            signUpResult = await signUpAction({ email, password, displayName });
        } catch {
            // Server Actions reject on a transport failure (offline, server down) — without
            // this catch, submitting would stay true forever with no feedback to the client.
            setSubmitting(false);
            setError('Could not reach the server. Check your connection and try again.');
            return;
        }
        if (signUpResult.error) {
            setSubmitting(false);
            setError(signUpResult.error);
            return;
        }

        // signUp() doesn't always return a session in the same response — sign in explicitly
        // right after so we land on the first-list page instead of showing an empty page.
        let signInResult;
        try {
            signInResult = await signInAction({ email, password });
        } catch {
            setSubmitting(false);
            toast.info(
                'Account created. Log in to continue — could not sign you in automatically.',
            );
            router.push('/login');
            return;
        }
        setSubmitting(false);

        if (signInResult.error) {
            // Inline error state wouldn't survive the navigation below (this component
            // unmounts) — a toast does, since Toaster lives in the root layout.
            toast.info('Account created. Check your email to confirm it, then log in.');
            router.push('/login');
            return;
        }

        await clearAllCaches(queryClient);
        router.push('/');
        router.refresh();
    }

    return (
        <div className="rounded-lg border border-border bg-card p-6">
            <h1 className="text-lg font-semibold text-foreground">Sign up</h1>
            <p className="mt-1 text-sm text-muted-foreground">Create your Task Tracker account.</p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div className="space-y-1.5">
                    <label htmlFor="displayName" className="text-sm font-medium text-foreground">
                        Name
                    </label>
                    <Input
                        id="displayName"
                        type="text"
                        autoComplete="name"
                        value={displayName}
                        onChange={(event) => setDisplayName(event.target.value)}
                        disabled={submitting}
                        autoFocus
                    />
                </div>

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
                    />
                </div>

                <div className="space-y-1.5">
                    <label htmlFor="password" className="text-sm font-medium text-foreground">
                        Password
                    </label>
                    <PasswordInput
                        id="password"
                        autoComplete="new-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        disabled={submitting}
                    />
                    <p className="text-xs text-muted-foreground">
                        At least {MIN_PASSWORD_LENGTH} characters.
                    </p>
                </div>

                {error && <p className="text-xs text-destructive">{error}</p>}

                <Button type="submit" className="w-full gap-1.5" disabled={!isValid || submitting}>
                    {submitting && <Loader size="xs" />}
                    {submitting ? 'Creating account...' : 'Sign up'}
                </Button>
            </form>

            <p className="mt-4 text-center text-sm text-muted-foreground">
                Already have an account?{' '}
                <Link
                    href="/login"
                    className="font-medium text-foreground underline underline-offset-4"
                >
                    Log in
                </Link>
            </p>
        </div>
    );
}
