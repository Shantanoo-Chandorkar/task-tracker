/**
 * Animated shimmer skeleton that mirrors the Settings page layout.
 * Renders while the server component awaits the database query.
 */
export default function StatusManagerSkeleton() {
    return (
        <div className="px-4 md:px-8 py-8">
            <div className="mb-8 space-y-2">
                <div className="h-5 w-20 rounded bg-muted animate-pulse" />
                <div className="h-3 w-56 rounded bg-muted animate-pulse" />
            </div>

            <div className="space-y-2">
                <div className="h-4 w-16 rounded bg-muted animate-pulse" />
                <div className="h-3 w-64 rounded bg-muted animate-pulse mb-3" />

                {[0, 1, 2, 3].map((i) => (
                    <div
                        key={i}
                        className="flex items-center gap-2 rounded-md bg-card px-3 py-2.5 mb-2"
                    >
                        <div className="h-3.5 w-3.5 rounded bg-muted animate-pulse flex-shrink-0" />
                        <div className="h-3 w-3 rounded-full bg-muted animate-pulse flex-shrink-0" />
                        <div className="h-3.5 w-24 rounded bg-muted animate-pulse" />
                    </div>
                ))}
            </div>
        </div>
    );
}
