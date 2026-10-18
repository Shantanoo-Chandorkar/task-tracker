import { formatElapsedDuration } from '@/modules/timer/domain/session-clock';

/**
 * Builds a `conic-gradient` background string from category totals, one arc per category in
 * proportion to its share of the total tracked seconds.
 *
 * @param {Array<{ id: string, name: string, color: string, seconds: number }>} categorySlices -
 *   Non-zero category totals, in display order.
 * @param {number} totalSeconds - Sum of every slice's `seconds`, used to size each arc.
 * @returns {string} A CSS `conic-gradient(...)` value.
 */
function buildConicGradient(categorySlices, totalSeconds) {
    let cumulativePercent = 0;
    const stops = categorySlices.map((slice) => {
        const startPercent = cumulativePercent;
        cumulativePercent += (slice.seconds / totalSeconds) * 100;
        return `${slice.color} ${startPercent}% ${cumulativePercent}%`;
    });
    return `conic-gradient(${stops.join(', ')})`;
}

/**
 * Total tracked time per category (donut) and per habit (list) for duration habits - decision
 * 19's KPI 5, the only one that needs Timer data.
 *
 * @param {object} props
 * @param {{ byHabitId: Record<string, number>, byCategoryId: Record<string, number> }}
 *   props.trackedTime - `computeTotalTrackedTime`'s result.
 * @param {object[]} props.categories - The caller's habit categories (id, name, color).
 * @param {Map<string, string>} props.habitTitleById - Habit titles, keyed by id.
 */
export default function TrackedTimeBreakdown({ trackedTime, categories, habitTitleById }) {
    const habitSlices = Object.entries(trackedTime.byHabitId).filter(([, seconds]) => seconds > 0);

    if (habitSlices.length === 0) {
        return (
            <section className="rounded-xl bg-card p-4">
                <h2 className="text-sm font-semibold text-muted-foreground">Tracked time</h2>
                <p className="mt-2 text-sm text-muted-foreground">No duration habits tracked yet</p>
            </section>
        );
    }

    const categorySlices = categories
        .map((category) => ({
            id: category.id,
            name: category.name,
            color: category.color || 'var(--sidebar-primary)',
            seconds: trackedTime.byCategoryId[category.id] ?? 0,
        }))
        .filter((slice) => slice.seconds > 0);
    const totalCategorySeconds = categorySlices.reduce((sum, slice) => sum + slice.seconds, 0);

    return (
        <section className="rounded-xl bg-card p-4 space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground">Tracked time</h2>

            {categorySlices.length > 0 && (
                <div className="flex items-center gap-4">
                    <div
                        className="h-20 w-20 flex-shrink-0 rounded-full"
                        style={{
                            background: buildConicGradient(categorySlices, totalCategorySeconds),
                        }}
                        role="img"
                        aria-label="Tracked time by category"
                    />
                    <ul className="flex-1 space-y-1">
                        {categorySlices.map((slice) => (
                            <li key={slice.id} className="flex items-center gap-2 text-sm">
                                <span
                                    className="h-2 w-2 flex-shrink-0 rounded-full"
                                    style={{ backgroundColor: slice.color }}
                                />
                                <span className="flex-1 truncate">{slice.name}</span>
                                <span className="flex-shrink-0 font-mono text-xs text-metric">
                                    {formatElapsedDuration(slice.seconds)}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <ul className="space-y-1.5">
                {habitSlices.map(([habitId, seconds]) => (
                    <li key={habitId} className="flex items-center justify-between text-sm">
                        <span className="truncate">{habitTitleById.get(habitId) ?? 'Habit'}</span>
                        <span className="flex-shrink-0 font-mono text-xs text-metric">
                            {formatElapsedDuration(seconds)}
                        </span>
                    </li>
                ))}
            </ul>
        </section>
    );
}
