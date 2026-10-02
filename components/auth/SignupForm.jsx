'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/ui/loader';
import CharLimitField from '@/components/ui/CharLimitField';
import FormError from '@/components/ui/FormError';
import PasswordInput from '@/components/auth/PasswordInput';
import { signUpAction } from '@/actions/auth-actions';

// Length over composition rules (NIST 800-63B, OWASP) -- no forced uppercase/symbol/number.
const MIN_PASSWORD_LENGTH = 12;

/**
 * Email/password signup form. Email confirmation is required, so a successful signup never
 * gets an active session -- it shows a "check your email" state instead of signing in.
 *
 * @param {object} props
 * @param {string} [props.redirectTo] - Where the signup-confirmation email's link should land
 *   (e.g. back on an invite-accept page). Already sanitized server-side by the page.
 */
export default function SignupForm({ redirectTo = '/' }) {
    const [displayName, setDisplayName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [isSignedUp, setIsSignedUp] = useState(false);
    const errorId = useId();
    const passwordHintId = useId();
    // One shared message: the server does not say which field was wrong
    const errorFieldProps = error ? { 'aria-invalid': true, 'aria-describedby': errorId } : {};

    const isValid = displayName.trim() && email.trim() && password.length >= MIN_PASSWORD_LENGTH;

    async function handleSubmit(event) {
        event.preventDefault();
        if (!isValid) return;

        setSubmitting(true);

        let signUpResult;
        try {
            signUpResult = await signUpAction({
                email,
                password,
                displayName,
                redirectPath: redirectTo,
            });
        } catch {
            // Server Actions reject on a transport failure (offline, server down) - without
            // this catch, submitting would stay true forever with no feedback to the client.
            setSubmitting(false);
            setError('Could not reach the server. Check your connection and try again.');
            return;
        }
        setSubmitting(false);

        if (signUpResult.error) {
            setError(signUpResult.error);
            return;
        }

        setIsSignedUp(true);
    }

    return (
        <div className="rounded-lg border border-border bg-card p-6">
            <h1 className="text-lg font-semibold text-foreground">Sign up</h1>
            <p className="mt-1 text-sm text-muted-foreground">Create your Task Tracker account.</p>

            {isSignedUp ? (
                <div
                    role="status"
                    tabIndex={-1}
                    // The focused form was just removed; without this, focus falls back to the page body
                    ref={(confirmationNode) => confirmationNode?.focus()}
                    className="mt-6 space-y-1.5 outline-none"
                >
                    <p className="text-sm text-foreground">Account created.</p>
                    <p className="text-xs text-muted-foreground">
                        Check your email to confirm it and get started.
                    </p>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                    <CharLimitField label="Name" currentLength={displayName.length} maxLength={50}>
                        {(nameControlProps) => (
                            <Input
                                {...nameControlProps}
                                type="text"
                                autoComplete="name"
                                value={displayName}
                                onChange={(event) => setDisplayName(event.target.value)}
                                disabled={submitting}
                                autoFocus
                                maxLength={50}
                                aria-required="true"
                            />
                        )}
                    </CharLimitField>

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
                            aria-required="true"
                            {...errorFieldProps}
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
                            aria-required="true"
                            {...errorFieldProps}
                            aria-describedby={
                                error ? `${passwordHintId} ${errorId}` : passwordHintId
                            }
                        />
                        <p id={passwordHintId} className="text-xs text-muted-foreground">
                            At least {MIN_PASSWORD_LENGTH} characters.
                        </p>
                    </div>

                    <FormError errorId={errorId}>{error}</FormError>

                    <Button
                        type="submit"
                        className="w-full gap-1.5"
                        disabled={!isValid || submitting}
                    >
                        {submitting && <Loader size="xs" />}
                        {submitting ? 'Creating account...' : 'Sign up'}
                    </Button>
                </form>
            )}

            <p className="mt-4 text-center text-sm text-muted-foreground">
                Already have an account?{' '}
                <Link
                    href={
                        redirectTo === '/'
                            ? '/login'
                            : `/login?next=${encodeURIComponent(redirectTo)}`
                    }
                    className="font-medium text-foreground underline underline-offset-4"
                >
                    Log in
                </Link>
            </p>
        </div>
    );
}
