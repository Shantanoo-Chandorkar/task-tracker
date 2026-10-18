'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { Loader } from '@/components/custom/Loader';
import { useHabitCheckIn } from '@/hooks/useHabitCheckIn';
import { toDisplayHabitValue } from '@/modules/habits/domain/habit-display';
import HabitEntryDialog from './HabitEntryDialog';

/**
 * Today's check-in control for a habit. Binary taps toggle directly; count/quantity/duration
 * show the day's logged value and open `HabitEntryDialog` to enter or edit an amount.
 *
 * @param {object} props
 * @param {object} props.habit - The habit this control logs for.
 * @param {object|null} props.todayEntry - Today's existing entry, or null if none is logged yet.
 * @param {string} props.todayLocalDate - 'YYYY-MM-DD', the caller's current local date.
 */
export default function HabitCheckInControl({ habit, todayEntry, todayLocalDate }) {
    const { toggle } = useHabitCheckIn();
    const [isPending, setIsPending] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const isChecked = Boolean(todayEntry);
    const isQuit = habit.polarity === 'quit';

    async function handleToggleCheckIn() {
        setIsPending(true);
        try {
            await toggle(habit, todayEntry, todayLocalDate);
        } finally {
            setIsPending(false);
        }
    }

    if (habit.measure_kind === 'binary') {
        return (
            <button
                type="button"
                onClick={handleToggleCheckIn}
                disabled={isPending}
                aria-pressed={isChecked}
                className={`hit-area press-feedback flex flex-shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium motion-safe:transition-colors disabled:opacity-60 ${
                    isChecked
                        ? isQuit
                            ? 'border-destructive bg-destructive text-destructive-foreground'
                            : 'border-metric bg-metric text-background'
                        : 'border-field text-muted-foreground hover:border-foreground hover:text-foreground'
                }`}
            >
                {isPending ? (
                    <Loader size="sm" />
                ) : isChecked ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                ) : null}
                {isChecked ? (isQuit ? 'Slipped' : 'Done') : isQuit ? 'I slipped' : 'Done'}
            </button>
        );
    }

    const displayValue = todayEntry ? toDisplayHabitValue(habit, todayEntry.value) : 0;

    return (
        <>
            <button
                type="button"
                onClick={() => setIsDialogOpen(true)}
                className="hit-area press-feedback flex flex-shrink-0 items-center gap-1.5 rounded-full border border-field px-3 py-1.5 text-sm font-medium text-muted-foreground motion-safe:transition-colors hover:border-foreground hover:text-foreground"
            >
                {displayValue} / {toDisplayHabitValue(habit, habit.target_value)}
            </button>
            <HabitEntryDialog
                open={isDialogOpen}
                onClose={() => setIsDialogOpen(false)}
                habit={habit}
                entries={todayEntry ? [todayEntry] : []}
                todayLocalDate={todayLocalDate}
            />
        </>
    );
}
