export const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/**
 * Cookie options for every Supabase auth cookie: a 30-day sliding window, renewed on each refresh.
 *
 * @param {object} [supabaseOptions] - Options @supabase/ssr proposed for this cookie.
 * @returns {object} Options with a 30-day maxAge, or the original options when the cookie is being deleted.
 */
export function buildSessionCookieOptions(supabaseOptions = {}) {
    // maxAge 0 is sign-out asking the browser to drop the cookie; a 30-day maxAge would keep it alive
    if (supabaseOptions.maxAge === 0) return supabaseOptions;

    const { expires: _expires, ...keptOptions } = supabaseOptions;
    return {
        ...keptOptions,
        maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
        // No browser Supabase client reads these cookies, so script access is not needed
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
    };
}
