import { formatRingFraction } from '@/modules/analytics';
import CompletionRing from './CompletionRing';

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
                        {formatRingFraction(overall.completedCount, overall.dueCount, 'due habits')}
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
