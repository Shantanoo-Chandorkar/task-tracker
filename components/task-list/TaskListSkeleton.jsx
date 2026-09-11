/**
 * Animated shimmer skeleton that mirrors the task list row layout.
 * Renders while the server component awaits the database query.
 */
export default function TaskListSkeleton() {
    // Mix of varying widths to simulate realistic task title lengths
    const rowWidths = ['w-3/4', 'w-1/2', 'w-2/3', 'w-4/5', 'w-1/3', 'w-3/5', 'w-2/5', 'w-1/2'];

    return (
        <div className="px-4 md:px-8 py-6 space-y-6 [--row-indent:16px] md:[--row-indent:24px]">
            {/* Status group header skeleton */}
            <div className="flex items-center gap-2 pb-2 border-b border-border">
                <div className="h-3 w-3 rounded-full bg-muted animate-pulse" />
                <div className="h-3 w-16 rounded bg-muted animate-pulse" />
                <div className="h-3 w-6 rounded bg-muted animate-pulse" />
            </div>

            {/* Task row skeletons */}
            {rowWidths.map((width, i) => (
                <div
                    key={i}
                    className="flex items-center gap-3 py-1.5 px-2"
                    style={{ paddingLeft: `calc(var(--row-indent, 24px) * ${i % 3} + 8px)` }}
                >
                    <div className="h-4 w-4 rounded bg-muted animate-pulse flex-shrink-0" />
                    <div className={`h-4 ${width} rounded bg-muted animate-pulse`} />
                    <div className="ml-auto flex items-center gap-2 flex-shrink-0">
                        <div className="h-5 w-16 rounded-full bg-muted animate-pulse" />
                        <div className="h-5 w-5 rounded bg-muted animate-pulse" />
                    </div>
                </div>
            ))}
        </div>
    );
}
