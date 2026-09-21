/**
 * Stable, grep-able codes for guest-session failures, paired with a human-readable message in each result.
 * Never rename an existing value once shipped; add a new one instead.
 */
export const GUEST_ERROR_CODES = {
    RATE_LIMITED: 'GUEST_RATE_LIMITED',
    CAPTCHA_FAILED: 'GUEST_CAPTCHA_FAILED',
    START_FAILED: 'GUEST_START_FAILED',
    ALREADY_SIGNED_IN: 'GUEST_ALREADY_SIGNED_IN',
    SESSION_EXPIRED: 'GUEST_SESSION_EXPIRED',
    ACTION_NOT_ALLOWED: 'GUEST_ACTION_NOT_ALLOWED',
    LIMIT_REACHED: 'GUEST_LIMIT_REACHED',
};
