import { formatElapsedDuration } from '@/modules/timer/domain/session-clock';
import { buildConicGradientStops } from '@/modules/analytics';

/**
 * Total tracked time per habit, as a donut plus the matching legend - decision 19's KPI 5, the
 * only one that needs Timer data. One grouping shown once, not the donut and the list disagreeing.
 *
 * @param {object} props
 * @param {{ byHabitId: Record<string, number> }} props.trackedTime - `computeTotalTrackedTime`'s
 *   result.
 * @param {Map<string, string>} props.habitTitleById - Habit titles, keyed by id.
 * @param {Map<string, string>} props.habitColorById - Habit colors, keyed by id.
 */
export default function TrackedTimeBreakdown({ trackedTime, habitTitleById, habitColorById }) {
    const habitSlices = Object.entries(trackedTime.byHabitId)
        .filter(([, seconds]) => seconds > 0)
        .map(([habitId, seconds]) => ({
            id: habitId,
            name: habitTitleById.get(habitId) ?? 'Habit',
            color: habitColorById.get(habitId) ?? 'var(--sidebar-primary)',
            seconds,
        }));

    if (habitSlices.length === 0) {
        return (
            <section className="rounded-xl bg-card p-4">
                <h2 className="text-sm font-semibold text-muted-foreground">Tracked time</h2>
                <p className="mt-2 text-sm text-muted-foreground">No duration habits tracked yet</p>
            </section>
        );
    }

    const stops = buildConicGradientStops(habitSlices);
    const gradient = `conic-gradient(${stops
        .map((stop) => `${stop.color} ${stop.startPercent}% ${stop.endPercent}%`)
        .join(', ')})`;

    return (
        <section className="rounded-xl bg-card p-4 space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground">Tracked time</h2>

            <div className="flex items-center gap-4">
                <div
                    className="h-20 w-20 flex-shrink-0 rounded-full"
                    style={{ background: gradient }}
                    role="img"
                    aria-label="Tracked time by habit"
                />
                <ul className="flex-1 space-y-1">
                    {habitSlices.map((slice) => (
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
        </section>
    );
}
