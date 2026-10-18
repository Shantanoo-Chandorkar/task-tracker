'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { Loader } from '@/components/custom/Loader';
import { useHabitCheckIn } from '@/hooks/useHabitCheckIn';

/**
 * The Today view's tap-to-toggle check-in button. One simple control for every habit regardless
 * of measure_kind - the real per-type input (stepper, amount, duration) lands in Bucket B4.
 *
 * @param {object} props
 * @param {object} props.habit - The habit this control logs for.
 * @param {object|null} props.todayEntry - Today's existing entry, or null if none is logged yet.
 */
export default function HabitCheckInControl({ habit, todayEntry }) {
    const { toggle } = useHabitCheckIn();
    const [isPending, setIsPending] = useState(false);
    const isChecked = Boolean(todayEntry);
    const doneLabel = habit.polarity === 'quit' ? 'I slipped' : 'Done';

    async function handleToggleCheckIn() {
        setIsPending(true);
        try {
            await toggle(habit, todayEntry);
        } finally {
            setIsPending(false);
        }
    }

    return (
        <button
            type="button"
            onClick={handleToggleCheckIn}
            disabled={isPending}
            aria-pressed={isChecked}
            className={`hit-area press-feedback flex flex-shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium motion-safe:transition-colors disabled:opacity-60 ${
                isChecked
                    ? 'border-metric bg-metric text-background'
                    : 'border-field text-muted-foreground hover:border-foreground hover:text-foreground'
            }`}
        >
            {isPending ? (
                <Loader size="sm" />
            ) : isChecked ? (
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
            ) : null}
            {isChecked ? 'Done' : doneLabel}
        </button>
    );
}
