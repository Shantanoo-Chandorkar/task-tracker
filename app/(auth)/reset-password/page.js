import Link from 'next/link';
import ResetPasswordForm from '@/components/auth/ResetPasswordForm';
import { getCurrentUser } from '@/lib/auth/session';

export const metadata = { title: 'Reset password — Task Tracker' };

export default async function ResetPasswordPage() {
    const user = await getCurrentUser();

    if (!user) {
        return (
            <div className="rounded-lg border border-border bg-card p-6">
                <h1 className="text-lg font-semibold text-foreground">Link expired</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                    This reset link is no longer valid. Request a new one.
                </p>
                <Link
                    href="/forgot-password"
                    className="mt-4 inline-block text-sm font-medium text-foreground underline underline-offset-4"
                >
                    Request a new link
                </Link>
            </div>
        );
    }

    return <ResetPasswordForm />;
}
