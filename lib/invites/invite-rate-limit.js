import { SPACE_INVITES_PER_SENDER_PER_HOUR } from '@/lib/invites/invite-config';
import { decideSlidingWindowAction, takeSlidingWindowSlot } from '@/lib/sliding-window-rate-limit';

const WINDOW_MS = 60 * 60 * 1000;
const INVITE_ACTION_TYPE = 'space_invite';

/**
 * Decides whether another invite may be sent, and the counter to store.
 * Pure so the rules can be tested without a database.
 *
 * @param {{ failed_count: number, locked_until: string|null, updated_at: string }|null} existingRow - Stored counter.
 * @param {number} nowMs - Current time in milliseconds.
 * @returns {{ isAllowed: boolean, retryAfterMinutes: number|null, nextRow: object|null }} The verdict, and the row
 *   to store when allowed.
 */
export function decideInviteSend(existingRow, nowMs) {
    return decideSlidingWindowAction(existingRow, nowMs, {
        limit: SPACE_INVITES_PER_SENDER_PER_HOUR,
        windowMs: WINDOW_MS,
    });
}

/**
 * Counts an invite-send attempt against the sender's email + IP and says whether it may go ahead.
 *
 * @param {string} senderEmail - Email of the space owner sending the invite.
 * @param {string} ipAddress - Caller IP from `getClientIp`.
 * @returns {Promise<{ status: 'allowed'|'limited'|'unavailable', retryAfterMinutes: number|null }>}
 */
export async function takeInviteSendSlot(senderEmail, ipAddress) {
    return takeSlidingWindowSlot({
        email: senderEmail,
        ipAddress,
        actionType: INVITE_ACTION_TYPE,
        limit: SPACE_INVITES_PER_SENDER_PER_HOUR,
        windowMs: WINDOW_MS,
        logLabel: '[invites]',
    });
}
