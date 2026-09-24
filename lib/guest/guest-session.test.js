import { describe, expect, it } from 'vitest';
import {
    formatSecondsAsClock,
    getGuestExpiryTime,
    getGuestSecondsLeft,
    isGuestSessionExpired,
    isGuestUser,
} from './guest-session';
import { GUEST_SESSION_MINUTES } from './guest-config';

const CREATED_AT = '2026-01-01T12:00:00.000Z';
const createdAtMs = Date.parse(CREATED_AT);
const minutesAfterCreation = (minutes) => createdAtMs + minutes * 60 * 1000;

const guestUser = { id: 'g', is_anonymous: true, created_at: CREATED_AT };
const registeredUser = { id: 'u', is_anonymous: false, created_at: CREATED_AT, email: 'a@b.com' };

describe('isGuestUser', () => {
    it('is true only for an anonymous user', () => {
        expect(isGuestUser(guestUser)).toBe(true);
        expect(isGuestUser(registeredUser)).toBe(false);
    });

    it('is false for a missing user or a missing flag', () => {
        expect(isGuestUser(null)).toBe(false);
        expect(isGuestUser(undefined)).toBe(false);
        expect(isGuestUser({ id: 'x' })).toBe(false);
    });

    it('is not fooled by a truthy non-boolean flag', () => {
        expect(isGuestUser({ is_anonymous: 'true' })).toBe(false);
        expect(isGuestUser({ is_anonymous: 1 })).toBe(false);
    });
});

describe('getGuestExpiryTime', () => {
    it('is the creation time plus the guest session length', () => {
        expect(getGuestExpiryTime(guestUser).getTime()).toBe(
            minutesAfterCreation(GUEST_SESSION_MINUTES),
        );
    });

    it('is null for a registered user, a missing user, or an unreadable creation time', () => {
        expect(getGuestExpiryTime(registeredUser)).toBeNull();
        expect(getGuestExpiryTime(null)).toBeNull();
        expect(getGuestExpiryTime({ is_anonymous: true, created_at: 'not a date' })).toBeNull();
        expect(getGuestExpiryTime({ is_anonymous: true })).toBeNull();
    });
});

describe('isGuestSessionExpired', () => {
    it('is false one millisecond before the limit', () => {
        expect(
            isGuestSessionExpired(guestUser, minutesAfterCreation(GUEST_SESSION_MINUTES) - 1),
        ).toBe(false);
    });

    it('is true at exactly the limit and after it', () => {
        expect(isGuestSessionExpired(guestUser, minutesAfterCreation(GUEST_SESSION_MINUTES))).toBe(
            true,
        );
        expect(
            isGuestSessionExpired(guestUser, minutesAfterCreation(GUEST_SESSION_MINUTES + 1)),
        ).toBe(true);
    });

    it('is false for a brand new guest', () => {
        expect(isGuestSessionExpired(guestUser, createdAtMs)).toBe(false);
    });

    it('never expires a registered user, however old the account is', () => {
        expect(isGuestSessionExpired(registeredUser, minutesAfterCreation(60 * 24 * 365))).toBe(
            false,
        );
        expect(isGuestSessionExpired(null)).toBe(false);
    });

    it('treats a guest with an unreadable creation time as expired', () => {
        expect(
            isGuestSessionExpired({ is_anonymous: true, created_at: 'garbage' }, createdAtMs),
        ).toBe(true);
        expect(isGuestSessionExpired({ is_anonymous: true }, createdAtMs)).toBe(true);
    });
});

describe('getGuestSecondsLeft', () => {
    it('counts down from the full session length', () => {
        expect(getGuestSecondsLeft(guestUser, createdAtMs)).toBe(GUEST_SESSION_MINUTES * 60);
        expect(getGuestSecondsLeft(guestUser, minutesAfterCreation(1))).toBe(
            (GUEST_SESSION_MINUTES - 1) * 60,
        );
    });

    it('rounds down to whole seconds', () => {
        expect(getGuestSecondsLeft(guestUser, createdAtMs + 500)).toBe(
            GUEST_SESSION_MINUTES * 60 - 1,
        );
    });

    it('is 0 at and after expiry, never negative', () => {
        expect(getGuestSecondsLeft(guestUser, minutesAfterCreation(GUEST_SESSION_MINUTES))).toBe(0);
        expect(
            getGuestSecondsLeft(guestUser, minutesAfterCreation(GUEST_SESSION_MINUTES + 30)),
        ).toBe(0);
    });

    it('is null for a registered user or no user, and 0 for a guest with an unreadable creation time', () => {
        expect(getGuestSecondsLeft(registeredUser)).toBeNull();
        expect(getGuestSecondsLeft(null)).toBeNull();
        expect(getGuestSecondsLeft({ is_anonymous: true, created_at: 'garbage' })).toBe(0);
    });
});

describe('formatSecondsAsClock', () => {
    it('formats minutes and zero-padded seconds', () => {
        expect(formatSecondsAsClock(1721)).toBe('28:41');
        expect(formatSecondsAsClock(1800)).toBe('30:00');
        expect(formatSecondsAsClock(65)).toBe('1:05');
        expect(formatSecondsAsClock(9)).toBe('0:09');
    });

    it('shows 0:00 for zero and negative values, and ignores fractions', () => {
        expect(formatSecondsAsClock(0)).toBe('0:00');
        expect(formatSecondsAsClock(-5)).toBe('0:00');
        expect(formatSecondsAsClock(59.9)).toBe('0:59');
    });
});
