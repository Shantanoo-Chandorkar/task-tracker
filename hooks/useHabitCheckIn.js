'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { toggleHabitCheckIn } from '@/modules/habits/actions/habit-entry-actions';
import { claimInFlight } from '@/lib/in-flight-entities';

/**
 * Toggles a habit's check-in for today: logs one if none is cached yet, undoes it if one is.
 * Mirrors hooks/useTaskCompletion.js's shape - in-flight guard, network-vs-server error split,
 * optimistic cache patch from the action's own reply.
 *
 * @returns {{ toggle: (habit: object, todayEntry: object|null) => Promise<void> }}
 */
export function useHabitCheckIn() {
    const queryClient = useQueryClient();

    const toggle = useCallback(
        async (habit, todayEntry) => {
            const releaseInFlight = claimInFlight(`habit-checkin:${habit.id}`);
            if (!releaseInFlight) return;

            const isUndo = Boolean(todayEntry);
            const toastId = toast.loading(isUndo ? 'Undoing check-in...' : 'Logging check-in...');

            try {
                let actionResult;
                try {
                    actionResult = await toggleHabitCheckIn(habit.id);
                } catch {
                    toast.error(
                        'Could not reach the server. Check your connection and try again.',
                        { id: toastId },
                    );
                    return;
                }

                if (actionResult.error) {
                    toast.error(actionResult.error, { id: toastId });
                    return;
                }

                queryClient.setQueryData(['habit-entries'], (cachedEntries) => {
                    if (!cachedEntries) return cachedEntries;
                    return isUndo
                        ? cachedEntries.filter((entry) => entry.id !== todayEntry.id)
                        : [...cachedEntries, actionResult.data];
                });
                queryClient.invalidateQueries({ queryKey: ['habit-entries'] });
                toast.dismiss(toastId);
            } finally {
                releaseInFlight();
            }
        },
        [queryClient],
    );

    return { toggle };
}
