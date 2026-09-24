import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { GUEST_SESSIONS_PER_IP_PER_HOUR } from '@/lib/guest/guest-config';

const WINDOW_MS = 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;
// auth_rate_limits requires an email; guests have none, so every guest row shares this one key per IP
const GUEST_RATE_LIMIT_EMAIL = 'guest';
const GUEST_ACTION_TYPE = 'guest_create';

/**
 * Decides whether one more guest session may start from an IP, and what the stored counter becomes.
 * Pure so the rules can be tested without a database.
 *
 * @param {{ failed_count: number, locked_until: string|null, updated_at: string }|null} existingRow - Stored counter.
 * @param {number} nowMs - Current time in milliseconds.
 * @returns {{ isAllowed: boolean, retryAfterMinutes: number|null, nextRow: object|null }} The verdict, and the row
 *   to store when allowed.
 */
export function decideGuestCreation(existingRow, nowMs) {
    const lockedUntilMs = existingRow?.locked_until ? Date.parse(existingRow.locked_until) : 0;
    if (lockedUntilMs > nowMs) {
        const minutesLeft = Math.ceil((lockedUntilMs - nowMs) / MS_PER_MINUTE);
        return { isAllowed: false, retryAfterMinutes: minutesLeft, nextRow: null };
    }

    // The window slides: an hour without a new guest from this IP starts the count again from zero
    const lastAttemptMs = existingRow ? Date.parse(existingRow.updated_at) : 0;
    const isWithinWindow = nowMs - lastAttemptMs < WINDOW_MS;
    const sessionsInWindow = existingRow && isWithinWindow ? existingRow.failed_count : 0;

    if (sessionsInWindow >= GUEST_SESSIONS_PER_IP_PER_HOUR) {
        const retryAfterMs = lastAttemptMs + WINDOW_MS - nowMs;
        const minutesLeft = Math.max(1, Math.ceil(retryAfterMs / MS_PER_MINUTE));
        return { isAllowed: false, retryAfterMinutes: minutesLeft, nextRow: null };
    }

    const nextCount = sessionsInWindow + 1;
    const isLastAllowedSession = nextCount >= GUEST_SESSIONS_PER_IP_PER_HOUR;
    return {
        isAllowed: true,
        retryAfterMinutes: null,
        nextRow: {
            failed_count: nextCount,
            locked_until: isLastAllowedSession ? new Date(nowMs + WINDOW_MS).toISOString() : null,
            updated_at: new Date(nowMs).toISOString(),
        },
    };
}

/**
 * Counts a guest-session attempt against an IP and says whether it may go ahead.
 * Fails closed: if the counter cannot be read or written, the attempt is refused.
 * ponytail: read then write is not atomic, so a burst of parallel requests can overshoot the limit by a few.
 *
 * @param {string} ipAddress - Caller IP from `getClientIp`.
 * @returns {Promise<{ status: 'allowed'|'limited'|'unavailable', retryAfterMinutes: number|null }>}
 */
export async function takeGuestCreationSlot(ipAddress) {
    const adminClient = createAdminClient();

    const { data: existingRow, error: readError } = await adminClient
        .from('auth_rate_limits')
        .select('failed_count, locked_until, updated_at')
        .eq('email', GUEST_RATE_LIMIT_EMAIL)
        .eq('ip_address', ipAddress)
        .eq('action_type', GUEST_ACTION_TYPE)
        .maybeSingle();

    if (readError) {
        console.error('[guest] rate limit read failed', { detail: readError.message });
        return { status: 'unavailable', retryAfterMinutes: null };
    }

    const decision = decideGuestCreation(existingRow, Date.now());
    if (!decision.isAllowed)
        return { status: 'limited', retryAfterMinutes: decision.retryAfterMinutes };

    const { error: writeError } = await adminClient.from('auth_rate_limits').upsert(
        {
            email: GUEST_RATE_LIMIT_EMAIL,
            ip_address: ipAddress,
            action_type: GUEST_ACTION_TYPE,
            ...decision.nextRow,
        },
        { onConflict: 'email,ip_address,action_type' },
    );

    if (writeError) {
        console.error('[guest] rate limit write failed', { detail: writeError.message });
        return { status: 'unavailable', retryAfterMinutes: null };
    }

    return { status: 'allowed', retryAfterMinutes: null };
}
