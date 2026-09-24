'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

/**
 * Next.js error boundary rendered when an unhandled error occurs within a route segment.
 * Shows an amber alert with the error message and a button to retry the failed render.
 *
 * @param {object} props
 * @param {Error} props.error - The caught error
 * @param {Function} props.reset - Callback to retry rendering the segment
 */
export default function Error({ error, reset }) {
    return (
        <div className="flex min-h-[60vh] items-center justify-center p-8">
            <div className="max-w-md w-full space-y-4">
                <Alert className="border-amber-500/50 bg-amber-500/10">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <AlertTitle className="text-amber-500">Something went wrong</AlertTitle>
                    <AlertDescription className="text-amber-400/80">
                        {error?.message || 'An unexpected error occurred. Please try again.'}
                    </AlertDescription>
                </Alert>
                <Button onClick={reset} variant="outline" className="w-full">
                    Try again
                </Button>
            </div>
        </div>
    );
}
