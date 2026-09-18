// Durable so every cookie write (login and every later refresh) can re-read the same choice.
export const REMEMBER_ME_COOKIE = 'remember-me';
export const REMEMBER_ME_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
