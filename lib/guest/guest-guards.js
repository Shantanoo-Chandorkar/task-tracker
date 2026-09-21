import { isGuestUser } from '@/lib/guest/guest-session';
import { GUEST_ERROR_CODES } from '@/lib/guest/guest-error-codes';

/**
 * Refuses an action a guest must not use (sharing, join requests, password changes), which would send email
 * or change an account. Call it right after the logged-in check, before anything is read, written or sent.
 *
 * @param {object|null|undefined} user - Supabase user from `getCurrentUser()`.
 * @returns {{ error: string, code: string }|null} The refusal to return to the caller, or null for a registered user.
 */
export function blockGuestAction(user) {
    if (!isGuestUser(user)) return null;

    return {
        error: 'This feature is not available in guest mode. Sign up to use it.',
        code: GUEST_ERROR_CODES.ACTION_NOT_ALLOWED,
    };
}
