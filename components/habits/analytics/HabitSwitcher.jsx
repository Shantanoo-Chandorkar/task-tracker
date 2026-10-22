'use client';

import { useRouter } from 'next/navigation';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

/**
 * Switches the per-habit analytics page to a different habit, by navigating - the page already
 * works from already-cached data, so a different `habitId` is just a different URL to render.
 *
 * @param {object} props
 * @param {Array<{ id: string, title: string, archived_at: string|null }>} props.habits - Every
 *   habit of the caller, including archived ones, so the current habit is never missing from its
 *   own switcher.
 * @param {string} props.currentHabitId - The habit currently shown.
 */
export default function HabitSwitcher({ habits, currentHabitId }) {
    const router = useRouter();

    return (
        <Select
            value={currentHabitId}
            onValueChange={(nextHabitId) => router.push(`/habits/analytics/${nextHabitId}`)}
        >
            <SelectTrigger aria-label="Switch habit" className="w-56">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {habits.map((habit) => (
                    <SelectItem key={habit.id} value={habit.id}>
                        {habit.archived_at ? `${habit.title} (archived)` : habit.title}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
