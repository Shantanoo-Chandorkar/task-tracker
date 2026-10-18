'use server';

import { withAuthenticatedAction } from '@/lib/auth/with-authenticated-action';
import { toGuestLimitResult } from '@/lib/guest/guest-database-errors';
import {
    checkHabitEntryValue,
    checkHabitEntryLocalDate,
} from '@/modules/habits/domain/habit-input';
import { toHabitEntryRateLimitResult } from '@/modules/habits/domain/habit-entry-rate-limit';
import {
    HABIT_ID_REQUIRED,
    HABIT_NOT_FOUND,
    HABIT_ENTRY_ACTION_MEASURE_MISMATCH,
} from '@/modules/habits/errors';
import { loadHabitForWrite } from '@/modules/habits/data/load-habit-for-write';
import { findHabitEntryForDate } from '@/modules/habits/data/find-habit-entry-for-date';
import { resolveUserTodayLocalDate } from '@/modules/habits/data/resolve-user-local-date';

const ID_REQUIRED_FAILURE = { error: 'Habit ID is required', code: HABIT_ID_REQUIRED };
const NOT_FOUND_FAILURE = { error: 'Habit not found', code: HABIT_NOT_FOUND };
const BINARY_TOGGLE_ONLY_FAILURE = {
    error: 'This check-in needs an amount, not a toggle',
    code: HABIT_ENTRY_ACTION_MEASURE_MISMATCH,
};
const NON_BINARY_VALUE_ONLY_FAILURE = {
    error: 'Binary habits use the toggle action, not a value',
    code: HABIT_ENTRY_ACTION_MEASURE_MISMATCH,
};

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
 * Resolves and validates the local date a check-in write applies to, defaulting to today.
 *
 * @param {SupabaseClient} supabase - Request-scoped Supabase client.
 * @param {string} userId - Caller's id, for the server-resolved "today".
 * @param {unknown} rawLocalDate - Date sent by the client, or undefined for today.
 * @returns {Promise<Record<string, any>>} The validated date, or why it was rejected.
 */
async function resolveCheckInLocalDate(supabase, userId, rawLocalDate) {
    const todayLocalDate = await resolveUserTodayLocalDate(supabase, userId);
    return checkHabitEntryLocalDate(rawLocalDate ?? todayLocalDate, todayLocalDate);
}

/**
 * Toggles a binary habit's check-in for a day: logs one if none exists yet, undoes it if one does.
 * For a `quit` habit, logging an entry means "I slipped" - absence is already the success (decision 7).
 *
 * @param {string} habitId - Habit to check in or undo.
 * @param {string} [localDate] - 'YYYY-MM-DD' day to toggle; defaults to the caller's today.
 * @returns {Promise<{ data: Record<string, any>|null, error: string|null, code?: string }>}
 */
export const toggleHabitCheckIn = withAuthenticatedAction(
    '[habits] toggle check-in',
    'Unexpected error logging check-in',
    async (user, supabase, habitId, localDate) => {
        if (!habitId) return { data: null, ...ID_REQUIRED_FAILURE };

        const { habit, failure: loadFailure } = await loadHabitForWrite(
            supabase,
            habitId,
            NOT_FOUND_FAILURE,
        );
        if (loadFailure) return { data: null, ...loadFailure };
        if (habit.measure_kind !== 'binary') {
            return { data: null, ...BINARY_TOGGLE_ONLY_FAILURE };
        }

        const dateCheck = await resolveCheckInLocalDate(supabase, user.id, localDate);
        if (dateCheck.error) return { data: null, error: dateCheck.error, code: dateCheck.code };
        const resolvedLocalDate = dateCheck.localDate;

        const existingEntry = await findHabitEntryForDate(supabase, habitId, resolvedLocalDate);

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

        const valueCheck = checkHabitEntryValue(undefined, habit.measure_kind);
        if (valueCheck.error) {
            return { data: null, error: valueCheck.error, code: valueCheck.code };
        }

        const { data: createdEntry, error } = await supabase
            .from('habit_entries')
            .insert({
                habit_id: habitId,
                user_id: user.id,
                local_date: resolvedLocalDate,
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

/**
 * Logs, updates or clears a count/quantity/duration habit's check-in value for a day.
 * `rawValue` of null/undefined/'' clears the day's entry instead of validating it as a number.
 *
 * @param {string} habitId - Habit to log a value for.
 * @param {string} localDate - 'YYYY-MM-DD' day the value belongs to.
 * @param {unknown} rawValue - Value entered by the user, stored exactly as sent, or empty to clear.
 * @returns {Promise<{ data: Record<string, any>|null, error: string|null, code?: string }>}
 */
export const setHabitEntryValue = withAuthenticatedAction(
    '[habits] set entry value',
    'Unexpected error logging check-in',
    async (user, supabase, habitId, localDate, rawValue) => {
        if (!habitId) return { data: null, ...ID_REQUIRED_FAILURE };

        const { habit, failure: loadFailure } = await loadHabitForWrite(
            supabase,
            habitId,
            NOT_FOUND_FAILURE,
        );
        if (loadFailure) return { data: null, ...loadFailure };
        if (habit.measure_kind === 'binary') {
            return { data: null, ...NON_BINARY_VALUE_ONLY_FAILURE };
        }

        const dateCheck = await resolveCheckInLocalDate(supabase, user.id, localDate);
        if (dateCheck.error) return { data: null, error: dateCheck.error, code: dateCheck.code };
        const resolvedLocalDate = dateCheck.localDate;

        const existingEntry = await findHabitEntryForDate(supabase, habitId, resolvedLocalDate);
        const isClearing = rawValue === undefined || rawValue === null || rawValue === '';

        if (isClearing) {
            if (!existingEntry) return { data: null, error: null };
            const { error } = await supabase
                .from('habit_entries')
                .delete()
                .eq('id', existingEntry.id)
                .select()
                .maybeSingle();
            if (error) {
                return {
                    data: null,
                    ...toHabitEntryWriteFailure(error, 'Failed to clear check-in'),
                };
            }
            return { data: null, error: null };
        }

        const valueCheck = checkHabitEntryValue(rawValue, habit.measure_kind);
        if (valueCheck.error) {
            return { data: null, error: valueCheck.error, code: valueCheck.code };
        }

        if (existingEntry) {
            const { data: updatedEntry, error } = await supabase
                .from('habit_entries')
                .update({ value: valueCheck.value })
                .eq('id', existingEntry.id)
                .select()
                .maybeSingle();
            if (error) {
                return {
                    data: null,
                    ...toHabitEntryWriteFailure(error, 'Failed to log check-in'),
                };
            }
            return { data: updatedEntry, error: null };
        }

        const { data: createdEntry, error } = await supabase
            .from('habit_entries')
            .insert({
                habit_id: habitId,
                user_id: user.id,
                local_date: resolvedLocalDate,
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
