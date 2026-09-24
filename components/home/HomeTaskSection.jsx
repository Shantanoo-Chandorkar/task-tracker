'use client';

import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { Star } from 'lucide-react';
import StatusBadge from '@/components/status/StatusBadge';

/**
 * A titled list of tasks on the Home screen, each linking to its task page.
 *
 * @param {object} props
 * @param {string} props.title - Section heading.
 * @param {object[]} props.tasks - Task summaries from `/api/home`.
 * @param {string} props.emptyMessage - Shown when there are no tasks.
 * @param {boolean} [props.showsPriorityStar] - Marks every row with a filled star (the Priority section).
 * @returns {JSX.Element}
 */
export default function HomeTaskSection({ title, tasks, emptyMessage, showsPriorityStar = false }) {
    return (
        <section aria-label={title}>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {title}
            </h2>
            {tasks.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                    {emptyMessage}
                </p>
            ) : (
                <ul className="rounded-md border border-border divide-y divide-border/60">
                    {tasks.map((task) => (
                        <li key={task.id}>
                            <Link
                                href={`/lists/${task.list_id}/tasks/${task.id}`}
                                className="flex items-center gap-2 px-3 py-3 hover:bg-muted/50 motion-safe:transition-colors"
                            >
                                {showsPriorityStar && (
                                    <Star
                                        aria-hidden="true"
                                        className="h-3.5 w-3.5 flex-shrink-0 fill-amber-400 text-amber-400"
                                    />
                                )}
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm text-foreground">
                                        {task.title}
                                    </span>
                                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        {task.list_color && (
                                            <span
                                                className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                                                style={{ backgroundColor: task.list_color }}
                                            />
                                        )}
                                        <span className="truncate">{task.list_name}</span>
                                        {task.due_date && (
                                            <span className="flex-shrink-0">
                                                Due {format(parseISO(task.due_date), 'MMM d')}
                                            </span>
                                        )}
                                    </span>
                                </span>
                                <StatusBadge
                                    name={task.status_name}
                                    color={task.status_color}
                                    className="flex-shrink-0"
                                />
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
