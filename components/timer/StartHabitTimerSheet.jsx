'use client';

import { useState } from 'react';
import ModalShell from '@/components/custom/ModalShell';
import {
    Command,
    CommandInput,
    CommandList,
    CommandEmpty,
    CommandItem,
} from '@/components/ui/command';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useHabitsQuery } from '@/hooks/useHabitsQuery';
import { useTimeSessionsQuery } from '@/hooks/useTimeSessionsQuery';
import { useTimeSessionActions } from '@/hooks/useTimeSessionActions';
import { isLiveSession } from '@/modules/timer/domain/session-clock';

/**
 * Bottom sheet for picking a habit to start a timer on - the full habit list is already loaded
 * elsewhere, so this filters it client-side instead of making a server round trip.
 *
 * @param {object} props
 * @param {boolean} props.open - Whether the sheet is open.
 * @param {() => void} props.onClose - Called when the sheet should close.
 */
export default function StartHabitTimerSheet({ open, onClose }) {
    const isDesktop = useIsDesktop();
    const { data: habits = [] } = useHabitsQuery();
    const { data: sessions = [] } = useTimeSessionsQuery();
    const { start } = useTimeSessionActions();
    const [startingHabitId, setStartingHabitId] = useState(null);

    const liveHabitIds = new Set(
        sessions
            .filter(isLiveSession)
            .map((session) => session.habit_id)
            .filter(Boolean),
    );

    async function handleSelect(habitId) {
        if (startingHabitId) return;
        setStartingHabitId(habitId);
        const didStart = await start({ habitId });
        setStartingHabitId(null);
        if (didStart) onClose();
    }

    return (
        <ModalShell
            open={open}
            onClose={onClose}
            isBusy={Boolean(startingHabitId)}
            variant="sheet"
            side={isDesktop ? 'right' : 'bottom'}
            title="Start a habit timer"
            contentClassName={isDesktop ? 'sm:max-w-md' : undefined}
        >
            <Command label="Search habits" className="min-h-0">
                <CommandInput placeholder="Search habits" />
                <CommandList>
                    {/* cmdk shows/hides this on its own, based on whether any item below currently matches */}
                    <CommandEmpty>
                        {habits.length === 0 ? 'You have no habits yet.' : 'No habits found.'}
                    </CommandEmpty>

                    {habits.map((habit) => {
                        const isAlreadyLive = liveHabitIds.has(habit.id);
                        return (
                            <CommandItem
                                key={habit.id}
                                value={habit.title}
                                disabled={isAlreadyLive || Boolean(startingHabitId)}
                                onSelect={() => handleSelect(habit.id)}
                            >
                                <span className="flex-1 truncate">{habit.title}</span>
                                {isAlreadyLive && (
                                    <span className="text-xs text-muted-foreground">
                                        Already tracking
                                    </span>
                                )}
                            </CommandItem>
                        );
                    })}
                </CommandList>
            </Command>
        </ModalShell>
    );
}
