import { describe, expect, it } from 'vitest';
import { buildSessionCookieOptions, SESSION_COOKIE_MAX_AGE_SECONDS } from './session-cookies';

describe('buildSessionCookieOptions', () => {
    it('gives every auth cookie a 30-day, HttpOnly, SameSite=Lax lifetime', () => {
        const sessionCookieOptions = buildSessionCookieOptions({
            maxAge: 34560000,
            expires: new Date(),
            path: '/',
        });
        expect(sessionCookieOptions).toMatchObject({
            maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
        });
        expect(sessionCookieOptions.expires).toBeUndefined();
    });

    it('works when Supabase proposes no options', () => {
        expect(buildSessionCookieOptions().maxAge).toBe(SESSION_COOKIE_MAX_AGE_SECONDS);
    });

    it('leaves a sign-out deletion (maxAge 0) untouched', () => {
        const deletionOptions = { maxAge: 0, path: '/' };
        expect(buildSessionCookieOptions(deletionOptions)).toBe(deletionOptions);
    });
});
