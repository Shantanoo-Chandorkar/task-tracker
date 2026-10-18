'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { toggleHabitCheckIn } from '@/modules/habits/actions/habit-entry-actions';
import { claimInFlight } from '@/lib/in-flight-entities';

/**
 * Toggles a binary habit's check-in for a day: logs one if none is cached yet, undoes it if one is.
 * Mirrors hooks/useTaskCompletion.js's shape - in-flight guard, network-vs-server error split,
 * optimistic cache patch from the action's own reply.
 *
 * @returns {{ toggle: (habit: object, entry: object|null, localDate: string) => Promise<boolean> }}
 */
export function useHabitCheckIn() {
    const queryClient = useQueryClient();

    const toggle = useCallback(
        async (habit, entry, localDate) => {
            const releaseInFlight = claimInFlight(`habit-checkin:${habit.id}:${localDate}`);
            if (!releaseInFlight) return false;

            const isUndo = Boolean(entry);
            const toastId = toast.loading(isUndo ? 'Undoing check-in...' : 'Logging check-in...');

            try {
                let actionResult;
                try {
                    actionResult = await toggleHabitCheckIn(habit.id, localDate);
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
                    return isUndo
                        ? cachedEntries.filter((cachedEntry) => cachedEntry.id !== entry.id)
                        : [...cachedEntries, actionResult.data];
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

    return { toggle };
}
