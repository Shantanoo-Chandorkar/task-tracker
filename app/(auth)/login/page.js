import LoginForm from '@/components/auth/LoginForm';

export const metadata = { title: 'Log in - Task Tracker' };

/**
 * Login page. `?reason=guest-expired` is set when a guest session ends, so the form can explain why.
 *
 * @param {object} props
 * @param {Promise<{ reason?: string }>} props.searchParams - Query string, awaited as Next.js requires.
 * @returns {Promise<JSX.Element>}
 */
export default async function LoginPage({ searchParams }) {
    const { reason } = await searchParams;
    return <LoginForm hasGuestSessionEnded={reason === 'guest-expired'} />;
}
