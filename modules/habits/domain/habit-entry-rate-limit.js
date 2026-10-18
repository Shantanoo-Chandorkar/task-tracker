import { HABIT_ENTRY_RATE_LIMITED } from '@/modules/habits/errors';

const LIMIT_MARKER = 'HABIT_ENTRY_WRITE_RATE_LIMITED';

/**
 * Turns the database's habit-entry write limit error (migration 0046) into a friendly, stable result.
 *
 * @param {{ message?: string }|null|undefined} databaseError - Error from a habit_entries insert, update or delete.
 * @returns {{ error: string, code: string }|null} The result to return, or null when this is not a
 *   limit error and the caller should use its usual message.
 */
export function toHabitEntryRateLimitResult(databaseError) {
    const message = databaseError?.message;
    if (typeof message !== 'string' || !message.includes(LIMIT_MARKER)) return null;

    const isHourlyLimit = message.includes(`${LIMIT_MARKER}:hour`);
    return {
        error: isHourlyLimit
            ? "You've logged a lot of check-ins this hour. Take a short break and try again in a few minutes."
            : "You're checking in very quickly. Wait a moment and try again.",
        code: HABIT_ENTRY_RATE_LIMITED,
    };
}
