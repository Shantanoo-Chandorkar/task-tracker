'use server';

import { withAuthenticatedAction } from '@/lib/auth/with-authenticated-action';
import { toGuestLimitResult } from '@/lib/guest/guest-database-errors';
import { checkHabitEntryValue } from '@/modules/habits/domain/habit-input';
import { toHabitEntryRateLimitResult } from '@/modules/habits/domain/habit-entry-rate-limit';
import { HABIT_ID_REQUIRED, HABIT_NOT_FOUND } from '@/modules/habits/errors';
import { loadHabitForWrite } from '@/modules/habits/data/load-habit-for-write';
import { findHabitEntryForDate } from '@/modules/habits/data/find-habit-entry-for-date';
import { resolveUserTodayLocalDate } from '@/modules/habits/data/resolve-user-local-date';

const ID_REQUIRED_FAILURE = { error: 'Habit ID is required', code: HABIT_ID_REQUIRED };
const NOT_FOUND_FAILURE = { error: 'Habit not found', code: HABIT_NOT_FOUND };

/**
 * Maps a habit_entries write error to a friendly result, or a fixed generic message.
 *
 * @param {{ message?: string }} databaseError - Error from an insert or delete.
 * @param {string} genericError - Fallback message when the error matches no known marker.
 * @returns {{ error: string, code?: string }} The mapped, user-facing result.
 */
function toHabitEntryWriteFailure(databaseError, genericError) {
    const guestLimitResult = toGuestLimitResult(databaseError);
    if (guestLimitResult) return guestLimitResult;
    const rateLimitResult = toHabitEntryRateLimitResult(databaseError);
    if (rateLimitResult) return rateLimitResult;
    return { error: genericError };
}

/**
 * Toggles today's check-in for a habit: logs one if none exists yet, undoes it if one does.
 * A non-binary habit logs its target value - the real per-type input lands in a later bucket.
 * For a `quit` habit, logging an entry means "I slipped" - absence is already the success (decision 7).
 *
 * @param {string} habitId - Habit to check in or undo.
 * @returns {Promise<{ data: Record<string, any>|null, error: string|null, code?: string }>}
 */
export const toggleHabitCheckIn = withAuthenticatedAction(
    '[habits] toggle check-in',
    'Unexpected error logging check-in',
    async (user, supabase, habitId) => {
        if (!habitId) return { data: null, ...ID_REQUIRED_FAILURE };

        const { habit, failure: loadFailure } = await loadHabitForWrite(
            supabase,
            habitId,
            NOT_FOUND_FAILURE,
        );
        if (loadFailure) return { data: null, ...loadFailure };

        const todayLocalDate = await resolveUserTodayLocalDate(supabase, user.id);
        const existingEntry = await findHabitEntryForDate(supabase, habitId, todayLocalDate);

        if (existingEntry) {
            const { error } = await supabase
                .from('habit_entries')
                .delete()
                .eq('id', existingEntry.id)
                .select()
                .maybeSingle();
            if (error) {
                return {
                    data: null,
                    ...toHabitEntryWriteFailure(error, 'Failed to undo check-in'),
                };
            }
            return { data: null, error: null };
        }

        const rawValue = habit.measure_kind === 'binary' ? undefined : habit.target_value;
        const valueCheck = checkHabitEntryValue(rawValue, habit.measure_kind);
        if (valueCheck.error) {
            return { data: null, error: valueCheck.error, code: valueCheck.code };
        }

        const { data: createdEntry, error } = await supabase
            .from('habit_entries')
            .insert({
                habit_id: habitId,
                user_id: user.id,
                local_date: todayLocalDate,
                value: valueCheck.value,
            })
            .select()
            .single();
        if (error) {
            return { data: null, ...toHabitEntryWriteFailure(error, 'Failed to log check-in') };
        }

        return { data: createdEntry, error: null };
    },
);
