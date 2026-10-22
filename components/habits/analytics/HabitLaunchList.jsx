import Link from 'next/link';

/**
 * The one obvious place to open any habit's own analytics page.
 *
 * @param {object} props
 * @param {Array<{ id: string, title: string, color: string }>} props.habits - Habits to list, in
 *   display order; the caller decides which habits are in scope (e.g. active-only).
 */
export default function HabitLaunchList({ habits }) {
    if (habits.length === 0) return null;

    return (
        <section className="rounded-xl bg-card p-4 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Habits</h2>
            <ul className="space-y-1.5">
                {habits.map((habit) => (
                    <li key={habit.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                            <span
                                className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                                style={{ backgroundColor: habit.color }}
                                aria-hidden="true"
                            />
                            <span className="truncate">{habit.title}</span>
                        </span>
                        <Link
                            href={`/habits/analytics/${habit.id}`}
                            className="flex-shrink-0 text-primary underline-offset-4 hover:underline"
                        >
                            View analytics &gt;
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
}
