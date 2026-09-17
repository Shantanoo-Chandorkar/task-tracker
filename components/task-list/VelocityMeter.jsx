'use client';

/**
 * Percentage-complete indicator — completed task count over total, as a labeled progress bar.
 * Renders nothing if there's no "done" status configured or no tasks to measure.
 *
 * @param {object} props
 * @param {number} props.completedCount - Tasks in the "done" status
 * @param {number} props.totalCount - All tasks in the current view
 */
export default function VelocityMeter({ completedCount, totalCount }) {
    if (totalCount === 0) return null;

    const percent = Math.round((completedCount / totalCount) * 100);

    return (
        <div className="flex flex-col gap-1 min-w-[140px]">
            <div className="flex items-center justify-between text-xs gap-4">
                <span className="font-semibold uppercase tracking-wider text-muted-foreground">
                    Velocity
                </span>
                <span className="font-mono font-semibold text-metric">
                    {percent}% ({completedCount}/{totalCount})
                </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                    className="h-full rounded-full bg-metric motion-safe:transition-all"
                    style={{ width: `${percent}%` }}
                />
            </div>
        </div>
    );
}
