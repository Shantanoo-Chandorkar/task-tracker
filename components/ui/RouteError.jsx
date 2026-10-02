'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/**
 * Error UI shared by every error.js and global-error.js; never shows error.message, only the server log digest.
 *
 * @param {object} props
 * @param {Error & { digest?: string }} props.error - The caught error
 * @param {Function} props.retry - Re-fetches and re-renders the failed segment (reset cannot recover server errors)
 * @param {boolean} [props.showHomeLink] - False where the router is unavailable, e.g. global-error
 */
export default function RouteError({ error, retry, showHomeLink = true }) {
    useEffect(() => {
        console.error('[route-error]', error);
    }, [error]);

    return (
        <div className="flex min-h-[60vh] items-center justify-center p-8">
            <div className="max-w-md w-full space-y-4">
                <Alert className="border-amber-500/50 bg-amber-500/10">
                    <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-500" />
                    <AlertTitle>Something went wrong</AlertTitle>
                    <AlertDescription>
                        An unexpected error occurred. Please try again.
                        {error?.digest && (
                            <span className="mt-1 block text-xs">Reference: {error.digest}</span>
                        )}
                    </AlertDescription>
                </Alert>
                <Button onClick={() => retry()} variant="outline" className="w-full">
                    Try again
                </Button>
                {showHomeLink && (
                    <Button asChild variant="ghost" className="w-full">
                        <Link href="/">Go to Home</Link>
                    </Button>
                )}
            </div>
        </div>
    );
}
