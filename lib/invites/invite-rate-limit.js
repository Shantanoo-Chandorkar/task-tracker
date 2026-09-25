import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { SPACE_INVITES_PER_SENDER_PER_HOUR } from '@/lib/invites/invite-config';

const WINDOW_MS = 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;
const INVITE_ACTION_TYPE = 'space_invite';

/**
 * Decides whether another invite may be sent, and the counter to store. Pure -- testable with no database.
 * Sliding window, not a lockout: nothing resets a lock, so a lockout throttles a sender forever after one burst.
 *
 * @param {{ failed_count: number, locked_until: string|null, updated_at: string }|null} existingRow - Stored counter.
 * @param {number} nowMs - Current time in milliseconds.
 * @returns {{ isAllowed: boolean, retryAfterMinutes: number|null, nextRow: object|null }} The verdict, and the row
 *   to store when allowed.
 */
export function decideInviteSend(existingRow, nowMs) {
    const lockedUntilMs = existingRow?.locked_until ? Date.parse(existingRow.locked_until) : 0;
    if (lockedUntilMs > nowMs) {
        const minutesLeft = Math.ceil((lockedUntilMs - nowMs) / MS_PER_MINUTE);
        return { isAllowed: false, retryAfterMinutes: minutesLeft, nextRow: null };
    }

    // The window slides: an hour without a new send from this sender starts the count again from zero
    const lastAttemptMs = existingRow ? Date.parse(existingRow.updated_at) : 0;
    const isWithinWindow = nowMs - lastAttemptMs < WINDOW_MS;
    const sendsInWindow = existingRow && isWithinWindow ? existingRow.failed_count : 0;

    if (sendsInWindow >= SPACE_INVITES_PER_SENDER_PER_HOUR) {
        const retryAfterMs = lastAttemptMs + WINDOW_MS - nowMs;
        const minutesLeft = Math.max(1, Math.ceil(retryAfterMs / MS_PER_MINUTE));
        return { isAllowed: false, retryAfterMinutes: minutesLeft, nextRow: null };
    }

    const nextCount = sendsInWindow + 1;
    const isLastAllowedSend = nextCount >= SPACE_INVITES_PER_SENDER_PER_HOUR;
    return {
        isAllowed: true,
        retryAfterMinutes: null,
        nextRow: {
            failed_count: nextCount,
            locked_until: isLastAllowedSend ? new Date(nowMs + WINDOW_MS).toISOString() : null,
            updated_at: new Date(nowMs).toISOString(),
        },
    };
}

/**
 * Counts an invite-send attempt against the sender's email + IP and says whether it may go ahead.
 * Fails closed: if the counter cannot be read or written, the attempt is refused.
 * ponytail: read then write is not atomic, so a burst of parallel requests can overshoot the limit by a few.
 *
 * @param {string} senderEmail - Email of the space owner sending the invite.
 * @param {string} ipAddress - Caller IP from `getClientIp`.
 * @returns {Promise<{ status: 'allowed'|'limited'|'unavailable', retryAfterMinutes: number|null }>}
 */
export async function takeInviteSendSlot(senderEmail, ipAddress) {
    const adminClient = createAdminClient();

    const { data: existingRow, error: readError } = await adminClient
        .from('auth_rate_limits')
        .select('failed_count, locked_until, updated_at')
        .eq('email', senderEmail)
        .eq('ip_address', ipAddress)
        .eq('action_type', INVITE_ACTION_TYPE)
        .maybeSingle();

    if (readError) {
        console.error('[invites] rate limit read failed', { detail: readError.message });
        return { status: 'unavailable', retryAfterMinutes: null };
    }

    const decision = decideInviteSend(existingRow, Date.now());
    if (!decision.isAllowed)
        return { status: 'limited', retryAfterMinutes: decision.retryAfterMinutes };

    const { error: writeError } = await adminClient.from('auth_rate_limits').upsert(
        {
            email: senderEmail,
            ip_address: ipAddress,
            action_type: INVITE_ACTION_TYPE,
            ...decision.nextRow,
        },
        { onConflict: 'email,ip_address,action_type' },
    );

    if (writeError) {
        console.error('[invites] rate limit write failed', { detail: writeError.message });
        return { status: 'unavailable', retryAfterMinutes: null };
    }

    return { status: 'allowed', retryAfterMinutes: null };
}
