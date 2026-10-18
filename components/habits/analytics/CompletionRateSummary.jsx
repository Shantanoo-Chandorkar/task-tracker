const RING_RADIUS = 36;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * A small ring showing a 0-1 completion rate - hand-rolled SVG, the same no-library approach
 * `TrackedTimeBreakdown.jsx`'s `conic-gradient` donut uses for the equivalent KPI.
 *
 * @param {object} props
 * @param {number} props.rate - Completion rate, 0 to 1.
 */
function CompletionRing({ rate }) {
    const dashoffset = RING_CIRCUMFERENCE * (1 - rate);
    return (
        <div className="relative h-[88px] w-[88px] flex-shrink-0">
            <svg width="88" height="88" viewBox="0 0 88 88" className="-rotate-90">
                <circle
                    cx="44"
                    cy="44"
                    r={RING_RADIUS}
                    className="fill-none stroke-border"
                    strokeWidth="8"
                />
                <circle
                    cx="44"
                    cy="44"
                    r={RING_RADIUS}
                    className="fill-none stroke-primary motion-safe:transition-[stroke-dashoffset]"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={RING_CIRCUMFERENCE}
                    strokeDashoffset={dashoffset}
                />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-lg font-semibold text-foreground">
                {Math.round(rate * 100)}%
            </div>
        </div>
    );
}

/**
 * Overall and per-habit completion rate for the selected period - decision 19's KPI 1.
 *
 * @param {object} props
 * @param {{ byHabit: Array<{ habitId: string, dueCount: number, completedCount: number,
 *   completionRate: number|null }>, overall: { dueCount: number, completedCount: number,
 *   completionRate: number|null } }} props.completionRateBreakdown - `computeCompletionRate`'s result.
 * @param {Map<string, string>} props.habitTitleById - Habit titles, keyed by id.
 */
export default function CompletionRateSummary({ completionRateBreakdown, habitTitleById }) {
    const { byHabit, overall } = completionRateBreakdown;

    return (
        <section className="rounded-xl bg-card p-4 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Completion rate</h2>

            {overall.completionRate === null ? (
                <p className="text-sm text-muted-foreground">
                    Not enough data yet - log a check-in to see this fill in.
                </p>
            ) : (
                <div className="flex items-center gap-4">
                    <CompletionRing rate={overall.completionRate} />
                    <p className="text-sm text-muted-foreground">
                        {overall.completedCount} of {overall.dueCount} due habits completed
                    </p>
                </div>
            )}

            {byHabit.length > 0 && (
                <ul className="space-y-1.5">
                    {byHabit.map((habitRate) => (
                        <li
                            key={habitRate.habitId}
                            className="flex items-center justify-between text-sm"
                        >
                            <span className="truncate">
                                {habitTitleById.get(habitRate.habitId) ?? 'Habit'}
                            </span>
                            <span className="flex-shrink-0 font-mono text-xs text-metric">
                                {habitRate.completionRate === null
                                    ? '-'
                                    : `${Math.round(habitRate.completionRate * 100)}%`}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
