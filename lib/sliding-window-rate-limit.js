import { createClient as createAdminClient } from '@/lib/supabase/admin';

const MS_PER_MINUTE = 60 * 1000;

/**
 * Decides whether another action may go ahead under a sliding-window cap, and the counter to store.
 * Pure so the rules can be tested without a database.
 * Sliding window, not a lockout: hitting the cap throttles for one window, then resets on its own.
 *
 * @param {{ failed_count: number, locked_until: string|null, updated_at: string }|null} existingRow - Stored counter.
 * @param {number} nowMs - Current time in milliseconds.
 * @param {{ limit: number, windowMs: number }} config - The cap, and the window length in milliseconds.
 * @returns {{ isAllowed: boolean, retryAfterMinutes: number|null, nextRow: object|null }} The verdict, and the row
 *   to store when allowed.
 */
export function decideSlidingWindowAction(existingRow, nowMs, { limit, windowMs }) {
    const lockedUntilMs = existingRow?.locked_until ? Date.parse(existingRow.locked_until) : 0;
    if (lockedUntilMs > nowMs) {
        const minutesLeft = Math.ceil((lockedUntilMs - nowMs) / MS_PER_MINUTE);
        return { isAllowed: false, retryAfterMinutes: minutesLeft, nextRow: null };
    }

    // The window slides: a full window without a new attempt for this key starts the count again from zero
    const lastAttemptMs = existingRow ? Date.parse(existingRow.updated_at) : 0;
    const isWithinWindow = nowMs - lastAttemptMs < windowMs;
    const countInWindow = existingRow && isWithinWindow ? existingRow.failed_count : 0;

    if (countInWindow >= limit) {
        const retryAfterMs = lastAttemptMs + windowMs - nowMs;
        const minutesLeft = Math.max(1, Math.ceil(retryAfterMs / MS_PER_MINUTE));
        return { isAllowed: false, retryAfterMinutes: minutesLeft, nextRow: null };
    }

    const nextCount = countInWindow + 1;
    const isLastAllowed = nextCount >= limit;
    return {
        isAllowed: true,
        retryAfterMinutes: null,
        nextRow: {
            failed_count: nextCount,
            locked_until: isLastAllowed ? new Date(nowMs + windowMs).toISOString() : null,
            updated_at: new Date(nowMs).toISOString(),
        },
    };
}

/**
 * Counts an attempt against a key in `auth_rate_limits` and says whether it may go ahead.
 * Fails closed: if the counter cannot be read or written, the attempt is refused.
 * ponytail: read then write is not atomic, so a burst of parallel requests can overshoot the limit by a few.
 *
 * @param {object} key
 * @param {string} key.email - The row's email column; callers with no real email use a fixed placeholder.
 * @param {string} key.ipAddress - The row's ip_address column.
 * @param {string} key.actionType - The row's action_type column.
 * @param {number} key.limit - Attempts allowed per window.
 * @param {number} key.windowMs - Window length in milliseconds.
 * @param {string} key.logLabel - Prefix for a read/write failure's log line, e.g. '[guest]'.
 * @returns {Promise<{ status: 'allowed'|'limited'|'unavailable', retryAfterMinutes: number|null }>}
 */
export async function takeSlidingWindowSlot({
    email,
    ipAddress,
    actionType,
    limit,
    windowMs,
    logLabel,
}) {
    const adminClient = createAdminClient();

    const { data: existingRow, error: readError } = await adminClient
        .from('auth_rate_limits')
        .select('failed_count, locked_until, updated_at')
        .eq('email', email)
        .eq('ip_address', ipAddress)
        .eq('action_type', actionType)
        .maybeSingle();

    if (readError) {
        console.error(`${logLabel} rate limit read failed`, { detail: readError.message });
        return { status: 'unavailable', retryAfterMinutes: null };
    }

    const decision = decideSlidingWindowAction(existingRow, Date.now(), { limit, windowMs });
    if (!decision.isAllowed) {
        return { status: 'limited', retryAfterMinutes: decision.retryAfterMinutes };
    }

    const { error: writeError } = await adminClient
        .from('auth_rate_limits')
        .upsert(
            { email, ip_address: ipAddress, action_type: actionType, ...decision.nextRow },
            { onConflict: 'email,ip_address,action_type' },
        );

    if (writeError) {
        console.error(`${logLabel} rate limit write failed`, { detail: writeError.message });
        return { status: 'unavailable', retryAfterMinutes: null };
    }

    return { status: 'allowed', retryAfterMinutes: null };
}
