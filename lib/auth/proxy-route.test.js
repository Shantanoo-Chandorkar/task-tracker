import { describe, expect, it } from 'vitest';
import { decideProxyRoute } from './proxy-route';
import { GUEST_SESSION_MINUTES } from '@/lib/guest/guest-config';

const CREATED_AT = '2026-01-01T12:00:00.000Z';
const createdAtMs = Date.parse(CREATED_AT);
const minutesAfterCreation = (minutes) => createdAtMs + minutes * 60 * 1000;

const realUser = { id: 'u', is_anonymous: false, created_at: CREATED_AT, email: 'a@b.com' };
const guestUser = { id: 'g', is_anonymous: true, created_at: CREATED_AT };
const NEXT = { action: 'next', pathname: null, search: '', clearsSession: false };

describe('decideProxyRoute for a logged-out visitor', () => {
    it('sends a private page to /login without a reason', () => {
        expect(decideProxyRoute({ user: null, pathname: '/' })).toEqual({
            action: 'redirect',
            pathname: '/login',
            search: '',
            clearsSession: false,
        });
        expect(decideProxyRoute({ user: null, pathname: '/lists/abc' }).pathname).toBe('/login');
    });

    it.each(['/login', '/signup', '/forgot-password', '/reset-password', '/auth/confirm'])(
        'lets the public page %s through',
        (publicPath) => {
            expect(decideProxyRoute({ user: null, pathname: publicPath })).toEqual(NEXT);
        },
    );
});

describe('decideProxyRoute for a registered user (behaviour must match the old proxy)', () => {
    it('lets private pages through', () => {
        expect(decideProxyRoute({ user: realUser, pathname: '/' })).toEqual(NEXT);
        expect(decideProxyRoute({ user: realUser, pathname: '/spaces' })).toEqual(NEXT);
    });

    it('bounces /login and /signup to the home page', () => {
        const expected = { action: 'redirect', pathname: '/', search: '', clearsSession: false };
        expect(decideProxyRoute({ user: realUser, pathname: '/login' })).toEqual(expected);
        expect(decideProxyRoute({ user: realUser, pathname: '/signup' })).toEqual(expected);
    });

    it('does not bounce the password-reset pages, which can be legitimate mid-session', () => {
        expect(decideProxyRoute({ user: realUser, pathname: '/reset-password' })).toEqual(NEXT);
        expect(decideProxyRoute({ user: realUser, pathname: '/forgot-password' })).toEqual(NEXT);
    });

    it('is never treated as expired, however old the account is', () => {
        const oldNow = minutesAfterCreation(60 * 24 * 365);
        expect(decideProxyRoute({ user: realUser, pathname: '/', nowMs: oldNow })).toEqual(NEXT);
    });
});

describe('decideProxyRoute for a live guest', () => {
    const liveNow = minutesAfterCreation(GUEST_SESSION_MINUTES - 1);

    it('lets private pages through', () => {
        expect(decideProxyRoute({ user: guestUser, pathname: '/', nowMs: liveNow })).toEqual(NEXT);
    });

    it('is not bounced away from /login and /signup, so a guest can move on to a real account', () => {
        expect(decideProxyRoute({ user: guestUser, pathname: '/login', nowMs: liveNow })).toEqual(NEXT);
        expect(decideProxyRoute({ user: guestUser, pathname: '/signup', nowMs: liveNow })).toEqual(NEXT);
    });
});

describe('decideProxyRoute for an expired guest', () => {
    const expiredNow = minutesAfterCreation(GUEST_SESSION_MINUTES);

    it('sends a private page to /login with the guest-expired reason and clears the session', () => {
        expect(decideProxyRoute({ user: guestUser, pathname: '/', nowMs: expiredNow })).toEqual({
            action: 'redirect',
            pathname: '/login',
            search: '?reason=guest-expired',
            clearsSession: true,
        });
    });

    it('lets a public page through (no redirect loop) but still clears the session', () => {
        expect(decideProxyRoute({ user: guestUser, pathname: '/login', nowMs: expiredNow })).toEqual({
            action: 'next',
            pathname: null,
            search: '',
            clearsSession: true,
        });
    });

    it('treats a guest with an unreadable creation time as expired', () => {
        const brokenGuest = { id: 'g', is_anonymous: true, created_at: 'garbage' };
        expect(decideProxyRoute({ user: brokenGuest, pathname: '/', nowMs: createdAtMs }).clearsSession).toBe(true);
    });
});
