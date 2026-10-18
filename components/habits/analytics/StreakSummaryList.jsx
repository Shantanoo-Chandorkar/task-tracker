import { Flame } from 'lucide-react';

/**
 * Current and longest streak per habit, longest-current-streak first - decision 19's KPI 2.
 *
 * @param {object} props
 * @param {Array<{ habitId: string, currentStreak: number, longestStreak: number }>}
 *   props.streakSummary - `computeStreakSummary`'s result.
 * @param {Map<string, string>} props.habitTitleById - Habit titles, keyed by id.
 */
export default function StreakSummaryList({ streakSummary, habitTitleById }) {
    if (streakSummary.length === 0) return null;
    const sortedStreaks = [...streakSummary].sort((a, b) => b.currentStreak - a.currentStreak);

    return (
        <section className="rounded-xl bg-card p-4 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Streaks</h2>
            <ul className="space-y-1.5">
                {sortedStreaks.map((streak) => (
                    <li key={streak.habitId} className="flex items-center justify-between text-sm">
                        <span className="truncate">
                            {habitTitleById.get(streak.habitId) ?? 'Habit'}
                        </span>
                        <span className="flex flex-shrink-0 items-center gap-2 font-mono text-xs text-metric">
                            {streak.currentStreak > 0 && (
                                <Flame className="h-3 w-3" aria-hidden="true" />
                            )}
                            {streak.currentStreak} current / {streak.longestStreak} longest
                        </span>
                    </li>
                ))}
            </ul>
        </section>
    );
}
