import { beforeEach, describe, expect, it, vi } from 'vitest';

let store;
vi.mock('next/headers', () => ({
    cookies: async () => ({
        set: (name, value, options) => store.set(name, { value, options }),
        get: (name) => (store.has(name) ? { name, value: store.get(name).value } : undefined),
        delete: (name) => store.delete(name),
    }),
}));

const {
    setChallengeCookie,
    readAndClearChallengeCookie,
    WEBAUTHN_REGISTRATION_CHALLENGE_COOKIE,
    WEBAUTHN_AUTHENTICATION_CHALLENGE_COOKIE,
} = await import('./challenge-cookies');

beforeEach(() => {
    store = new Map();
});

describe('setChallengeCookie / readAndClearChallengeCookie', () => {
    it('round-trips a challenge through set and read-and-clear', async () => {
        await setChallengeCookie(WEBAUTHN_REGISTRATION_CHALLENGE_COOKIE, 'abc123');
        const challenge = await readAndClearChallengeCookie(WEBAUTHN_REGISTRATION_CHALLENGE_COOKIE);
        expect(challenge).toBe('abc123');
    });

    it('clears the cookie, so a second read sees nothing left to replay', async () => {
        await setChallengeCookie(WEBAUTHN_REGISTRATION_CHALLENGE_COOKIE, 'abc123');
        await readAndClearChallengeCookie(WEBAUTHN_REGISTRATION_CHALLENGE_COOKIE);

        const secondRead = await readAndClearChallengeCookie(
            WEBAUTHN_REGISTRATION_CHALLENGE_COOKIE,
        );
        expect(secondRead).toBeNull();
    });

    it('returns null when the cookie was never set (expired, wrong tab, etc.)', async () => {
        const challenge = await readAndClearChallengeCookie(WEBAUTHN_REGISTRATION_CHALLENGE_COOKIE);
        expect(challenge).toBeNull();
    });

    it('keeps the registration and authentication challenges independent', async () => {
        await setChallengeCookie(WEBAUTHN_REGISTRATION_CHALLENGE_COOKIE, 'registration-challenge');
        await setChallengeCookie(
            WEBAUTHN_AUTHENTICATION_CHALLENGE_COOKIE,
            'authentication-challenge',
        );

        const registrationChallenge = await readAndClearChallengeCookie(
            WEBAUTHN_REGISTRATION_CHALLENGE_COOKIE,
        );
        const authenticationChallenge = await readAndClearChallengeCookie(
            WEBAUTHN_AUTHENTICATION_CHALLENGE_COOKIE,
        );

        expect(registrationChallenge).toBe('registration-challenge');
        expect(authenticationChallenge).toBe('authentication-challenge');
    });

    it('sets the cookie HttpOnly, SameSite=Lax, with a 5-minute lifetime', async () => {
        await setChallengeCookie(WEBAUTHN_REGISTRATION_CHALLENGE_COOKIE, 'abc123');

        expect(store.get(WEBAUTHN_REGISTRATION_CHALLENGE_COOKIE).options).toMatchObject({
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
            maxAge: 5 * 60,
        });
    });
});
