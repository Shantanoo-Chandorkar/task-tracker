import { describe, expect, it } from 'vitest';
import { decideGuestCreation } from './guest-rate-limit';
import { GUEST_SESSIONS_PER_IP_PER_HOUR } from './guest-config';

const NOW = Date.parse('2026-01-01T12:00:00.000Z');
const minutesAgo = (minutes) => new Date(NOW - minutes * 60 * 1000).toISOString();
const rowWith = (count, updatedMinutesAgo, lockedUntil = null) => ({
    failed_count: count,
    locked_until: lockedUntil,
    updated_at: minutesAgo(updatedMinutesAgo),
});

describe('decideGuestCreation', () => {
    it('allows the first guest from an IP and starts the count at 1', () => {
        const decision = decideGuestCreation(null, NOW);
        expect(decision.isAllowed).toBe(true);
        expect(decision.nextRow.failed_count).toBe(1);
        expect(decision.nextRow.locked_until).toBeNull();
    });

    it('allows guests up to the limit and locks for an hour on the last allowed one', () => {
        const beforeLast = rowWith(GUEST_SESSIONS_PER_IP_PER_HOUR - 2, 5);
        expect(decideGuestCreation(beforeLast, NOW).nextRow.locked_until).toBeNull();

        const last = decideGuestCreation(rowWith(GUEST_SESSIONS_PER_IP_PER_HOUR - 1, 5), NOW);
        expect(last.isAllowed).toBe(true);
        expect(last.nextRow.failed_count).toBe(GUEST_SESSIONS_PER_IP_PER_HOUR);
        expect(Date.parse(last.nextRow.locked_until)).toBe(NOW + 60 * 60 * 1000);
    });

    it('refuses while locked and reports the minutes left, rounded up', () => {
        const lockedUntil = new Date(NOW + 10 * 60 * 1000 + 1).toISOString();
        const decision = decideGuestCreation(rowWith(GUEST_SESSIONS_PER_IP_PER_HOUR, 50, lockedUntil), NOW);
        expect(decision).toEqual({ isAllowed: false, retryAfterMinutes: 11, nextRow: null });
    });

    it('allows again once the lock has passed and the window is over, restarting the count', () => {
        const decision = decideGuestCreation(rowWith(GUEST_SESSIONS_PER_IP_PER_HOUR, 61, minutesAgo(1)), NOW);
        expect(decision.isAllowed).toBe(true);
        expect(decision.nextRow.failed_count).toBe(1);
    });

    it('restarts the count when the last guest from this IP was over an hour ago', () => {
        const decision = decideGuestCreation(rowWith(2, 90), NOW);
        expect(decision.isAllowed).toBe(true);
        expect(decision.nextRow.failed_count).toBe(1);
    });

    it('refuses a full count with no lock recorded, as a parallel burst could leave behind', () => {
        const decision = decideGuestCreation(rowWith(GUEST_SESSIONS_PER_IP_PER_HOUR, 20), NOW);
        expect(decision.isAllowed).toBe(false);
        expect(decision.retryAfterMinutes).toBe(40);
    });

    it('treats an unreadable timestamp as no history instead of throwing', () => {
        const decision = decideGuestCreation({ failed_count: 5, locked_until: null, updated_at: 'garbage' }, NOW);
        expect(decision.isAllowed).toBe(true);
        expect(decision.nextRow.failed_count).toBe(1);
    });
});
