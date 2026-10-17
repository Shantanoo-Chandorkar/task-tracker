import { GUEST_SESSIONS_PER_IP_PER_HOUR } from '@/lib/guest/guest-config';
import { decideSlidingWindowAction, takeSlidingWindowSlot } from '@/lib/sliding-window-rate-limit';

const WINDOW_MS = 60 * 60 * 1000;
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
    return decideSlidingWindowAction(existingRow, nowMs, {
        limit: GUEST_SESSIONS_PER_IP_PER_HOUR,
        windowMs: WINDOW_MS,
    });
}

/**
 * Counts a guest-session attempt against an IP and says whether it may go ahead.
 *
 * @param {string} ipAddress - Caller IP from `getClientIp`.
 * @returns {Promise<{ status: 'allowed'|'limited'|'unavailable', retryAfterMinutes: number|null }>}
 */
export async function takeGuestCreationSlot(ipAddress) {
    return takeSlidingWindowSlot({
        email: GUEST_RATE_LIMIT_EMAIL,
        ipAddress,
        actionType: GUEST_ACTION_TYPE,
        limit: GUEST_SESSIONS_PER_IP_PER_HOUR,
        windowMs: WINDOW_MS,
        logLabel: '[guest]',
    });
}
