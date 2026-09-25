import LoginForm from '@/components/auth/LoginForm';
import { sanitizeRedirectPath } from '@/lib/validation';

export const metadata = { title: 'Log in - Task Tracker' };

/**
 * Login page. `?reason=guest-expired` is set when a guest session ends, so the form can explain
 * why. `?next=` (e.g. from an invite-accept link) is sanitized here, server-side, before being
 * handed to the client form.
 *
 * @param {object} props
 * @param {Promise<{ reason?: string, next?: string }>} props.searchParams - Query string, awaited as Next.js requires.
 * @returns {Promise<JSX.Element>}
 */
export default async function LoginPage({ searchParams }) {
    const { reason, next: redirectPath } = await searchParams;
    return (
        <LoginForm
            hasGuestSessionEnded={reason === 'guest-expired'}
            redirectTo={sanitizeRedirectPath(redirectPath)}
        />
    );
}
