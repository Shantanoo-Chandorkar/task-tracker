import SignupForm from '@/components/auth/SignupForm';
import { sanitizeRedirectPath } from '@/lib/validation';

export const metadata = { title: 'Sign up - Task Tracker' };

/**
 * Signup page. `?next=` (e.g. from an invite-accept link) is sanitized here, server-side,
 * before being handed to the client form.
 *
 * @param {object} props
 * @param {Promise<{ next?: string }>} props.searchParams - Query string, awaited as Next.js requires.
 * @returns {Promise<JSX.Element>}
 */
export default async function SignupPage({ searchParams }) {
    const { next: redirectPath } = await searchParams;
    return <SignupForm redirectTo={sanitizeRedirectPath(redirectPath)} />;
}
