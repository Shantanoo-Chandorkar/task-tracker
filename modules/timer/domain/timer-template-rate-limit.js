import { TIMER_TEMPLATE_RATE_LIMITED } from '@/modules/timer/errors';

const LIMIT_MARKER = 'TIMER_TEMPLATE_WRITE_RATE_LIMITED';

/**
 * Turns the database's timer-template write limit error (migration 0050) into a friendly, stable result.
 *
 * @param {{ message?: string }|null|undefined} databaseError - Error from a timer_templates insert, update or delete.
 * @returns {{ error: string, code: string }|null} The result to return, or null when this is not a
 *   limit error and the caller should use its usual message.
 */
export function toTimerTemplateRateLimitResult(databaseError) {
    const message = databaseError?.message;
    if (typeof message !== 'string' || !message.includes(LIMIT_MARKER)) return null;

    const isHourlyLimit = message.includes(`${LIMIT_MARKER}:hour`);
    return {
        error: isHourlyLimit
            ? "You've saved a lot of templates this hour. Take a short break and try again in a few minutes."
            : "You're saving templates very quickly. Wait a moment and try again.",
        code: TIMER_TEMPLATE_RATE_LIMITED,
    };
}
