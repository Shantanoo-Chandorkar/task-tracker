import { TIME_SESSION_RATE_LIMITED } from '@/modules/timer/errors';

const LIMIT_MARKER = 'TIME_SESSION_WRITE_RATE_LIMITED';

/**
 * Turns the database's time-session write limit error (migration 0049) into a friendly, stable result.
 *
 * @param {{ message?: string }|null|undefined} databaseError - Error from a time_sessions insert, update or delete.
 * @returns {{ error: string, code: string }|null} The result to return, or null when this is not a
 *   limit error and the caller should use its usual message.
 */
export function toTimeSessionRateLimitResult(databaseError) {
    const message = databaseError?.message;
    if (typeof message !== 'string' || !message.includes(LIMIT_MARKER)) return null;

    const isHourlyLimit = message.includes(`${LIMIT_MARKER}:hour`);
    return {
        error: isHourlyLimit
            ? "You've controlled a lot of timers this hour. Take a short break and try again in a few minutes."
            : "You're controlling the timer very quickly. Wait a moment and try again.",
        code: TIME_SESSION_RATE_LIMITED,
    };
}
