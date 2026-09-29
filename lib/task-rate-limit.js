import { TASK_RATE_LIMITED } from '@/lib/error-codes';

const LIMIT_MARKER = 'TASK_WRITE_RATE_LIMITED';

/**
 * Turns the database's task-write limit error (migration 0037) into a friendly, stable result.
 *
 * @param {{ message?: string }|null|undefined} databaseError - Error from a task insert, update, delete or rpc.
 * @returns {{ error: string, code: string }|null} The result to return, or null when this is not a limit error and
 *   the caller should use its usual message.
 */
export function toTaskRateLimitResult(databaseError) {
    const message = databaseError?.message;
    if (typeof message !== 'string' || !message.includes(LIMIT_MARKER)) return null;

    const isHourlyLimit = message.includes(`${LIMIT_MARKER}:hour`);
    return {
        error: isHourlyLimit
            ? "You've made a lot of changes this hour. Take a short break and try again in a few minutes."
            : "You're making changes very quickly. Wait a moment and try again.",
        code: TASK_RATE_LIMITED,
    };
}
