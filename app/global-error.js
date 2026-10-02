'use client';

import RouteError from '@/components/ui/RouteError';
import './globals.css';

/**
 * Fallback for a failed root layout; owns html/body because it replaces that layout.
 *
 * @param {object} props
 * @param {Error & { digest?: string }} props.error - The caught error
 * @param {Function} props.retry - Re-fetches and re-renders the app
 */
export default function GlobalError({ error, retry }) {
    return (
        <html lang="en">
            <body className="bg-background text-foreground">
                <RouteError error={error} retry={retry} showHomeLink={false} />
            </body>
        </html>
    );
}
