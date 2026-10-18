'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { setHabitEntryValue } from '@/modules/habits/actions/habit-entry-actions';
import { claimInFlight } from '@/lib/in-flight-entities';

/**
 * Logs, updates or clears a count/quantity/duration habit's check-in value for a day.
 * Mirrors hooks/useHabitCheckIn.js's shape - in-flight guard, network-vs-server error split,
 * optimistic cache patch from the action's own reply.
 *
 * @returns {{ setValue: (habit: object, entry: object|null, localDate: string, rawValue: unknown)
 *   => Promise<boolean> }}
 */
export function useHabitEntryValue() {
    const queryClient = useQueryClient();

    const setValue = useCallback(
        async (habit, entry, localDate, rawValue) => {
            const releaseInFlight = claimInFlight(`habit-entry-value:${habit.id}:${localDate}`);
            if (!releaseInFlight) return false;

            const isClearing = rawValue === undefined || rawValue === null || rawValue === '';
            const toastId = toast.loading(isClearing ? 'Clearing check-in...' : 'Saving...');

            try {
                let actionResult;
                try {
                    actionResult = await setHabitEntryValue(habit.id, localDate, rawValue);
                } catch {
                    toast.error(
                        'Could not reach the server. Check your connection and try again.',
                        { id: toastId },
                    );
                    return false;
                }

                if (actionResult.error) {
                    toast.error(actionResult.error, { id: toastId });
                    return false;
                }

                queryClient.setQueryData(['habit-entries'], (cachedEntries) => {
                    if (!cachedEntries) return cachedEntries;
                    if (isClearing) {
                        return entry
                            ? cachedEntries.filter((row) => row.id !== entry.id)
                            : cachedEntries;
                    }
                    if (entry) {
                        return cachedEntries.map((row) =>
                            row.id === entry.id ? actionResult.data : row,
                        );
                    }
                    return [...cachedEntries, actionResult.data];
                });
                queryClient.invalidateQueries({ queryKey: ['habit-entries'] });
                toast.dismiss(toastId);
                return true;
            } finally {
                releaseInFlight();
            }
        },
        [queryClient],
    );

    return { setValue };
}
