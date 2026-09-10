/**
 * Animated shimmer skeleton that mirrors the Task Detail page layout.
 * Renders while the server component awaits the database query.
 */
export default function TaskDetailSkeleton() {
    return (
        <div className="space-y-6">
            {/* Breadcrumb */}
            <div className="h-3 w-32 rounded bg-muted animate-pulse" />

            {/* Header */}
            <div className="h-6 w-2/3 rounded bg-muted animate-pulse" />

            {/* Status pill */}
            <div className="h-6 w-20 rounded-full bg-muted animate-pulse" />

            {/* Subtasks */}
            <div className="pt-2 border-t border-border space-y-3">
                <div className="flex items-center justify-between py-3">
                    <div className="h-3 w-16 rounded bg-muted animate-pulse" />
                    <div className="h-6 w-24 rounded bg-muted animate-pulse" />
                </div>
                {['w-3/4', 'w-1/2', 'w-2/3'].map((width, i) => (
                    <div key={i} className="flex items-center gap-2 py-1.5">
                        <div className="h-2 w-2 rounded-full bg-muted animate-pulse flex-shrink-0" />
                        <div className={`h-4 ${width} rounded bg-muted animate-pulse`} />
                    </div>
                ))}
            </div>
        </div>
    );
}
