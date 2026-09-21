/**
 * Stable, grep-able codes for every auth failure path. Paired with a human-readable message
 * in every action's return value - the message is for the UI, the code is for logs/support.
 * Never rename an existing value once shipped; add a new one instead, so a code found in a
 * log always means the same thing it meant the day it was written.
 */
export const AUTH_ERROR_CODES = {
    EMAIL_INVALID: 'AUTH_EMAIL_INVALID',
    PASSWORD_TOO_SHORT: 'AUTH_PASSWORD_TOO_SHORT',
    DISPLAY_NAME_REQUIRED: 'AUTH_DISPLAY_NAME_REQUIRED',
    EMAIL_ALREADY_REGISTERED: 'AUTH_EMAIL_ALREADY_REGISTERED',
    SIGNUP_FAILED: 'AUTH_SIGNUP_FAILED',
    INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
    SIGNIN_FAILED: 'AUTH_SIGNIN_FAILED',
    EMAIL_NOT_CONFIRMED: 'AUTH_EMAIL_NOT_CONFIRMED',
    SIGNOUT_FAILED: 'AUTH_SIGNOUT_FAILED',
    ACCOUNT_LOCKED: 'AUTH_ACCOUNT_LOCKED',
    RESET_REQUEST_FAILED: 'AUTH_RESET_REQUEST_FAILED',
    RESET_TOKEN_INVALID: 'AUTH_RESET_TOKEN_INVALID',
    PASSWORD_UPDATE_FAILED: 'AUTH_PASSWORD_UPDATE_FAILED',
    SESSION_CHECK_UNAVAILABLE: 'AUTH_SESSION_CHECK_UNAVAILABLE',
};
