import Link from 'next/link';
import { Button } from '@/components/ui/button';

/**
 * Not-found message shared by every not-found.js.
 */
export default function NotFoundMessage() {
    return (
        <div className="flex min-h-[60vh] items-center justify-center p-8">
            <div className="w-full max-w-md space-y-4 text-center">
                <h1 className="text-lg font-semibold text-foreground">Page not found</h1>
                {/* Same wording for "deleted" and "no access" so a missing page never confirms a hidden one exists. */}
                <p className="text-sm text-muted-foreground">
                    This page doesn&apos;t exist, or you don&apos;t have access to it.
                </p>
                <Button asChild variant="outline" className="w-full">
                    <Link href="/">Go to Home</Link>
                </Button>
            </div>
        </div>
    );
}
