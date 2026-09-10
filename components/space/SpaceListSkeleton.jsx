/**
 * Animated shimmer skeleton that mirrors the Spaces page layout.
 * Renders while the server component awaits the database query.
 */
export default function SpaceListSkeleton() {
    return (
        <div className="px-4 md:px-8 py-8">
            <div className="mb-8 space-y-2">
                <div className="h-5 w-20 rounded bg-muted animate-pulse" />
                <div className="h-3 w-56 rounded bg-muted animate-pulse" />
            </div>

            {[0, 1].map((section) => (
                <div key={section} className="rounded-md border border-border mb-4">
                    <div className="flex items-center gap-1.5 py-2.5 px-2">
                        <div className="h-3.5 w-3.5 rounded bg-muted animate-pulse flex-shrink-0" />
                        <div className="h-4 w-4 rounded-full bg-muted animate-pulse flex-shrink-0" />
                        <div className="h-3.5 w-24 rounded bg-muted animate-pulse" />
                    </div>
                    <div className="border-t border-border/50">
                        {['w-1/3', 'w-1/4'].map((width, i) => (
                            <div key={i} className="flex items-center gap-1.5 py-2 pl-6 pr-2">
                                <div className="h-3.5 w-3.5 rounded bg-muted animate-pulse flex-shrink-0" />
                                <div className="h-3 w-3 rounded-full bg-muted animate-pulse flex-shrink-0" />
                                <div className={`h-3.5 ${width} rounded bg-muted animate-pulse`} />
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
