import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveUserTodayLocalDate } from './resolve-user-local-date';

/**
 * Fake Supabase client whose `profiles` select resolves to one row (or none).
 *
 * @param {{ timezone?: string }|null} profile - Row `maybeSingle()` resolves to, or null for no row.
 * @returns {object} A `from`-only fake client.
 */
function makeSupabase(profile) {
    const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({ data: profile })),
    };
    return { from: vi.fn(() => query) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('resolveUserTodayLocalDate', () => {
    it('resolves today in the profile timezone', async () => {
        const supabase = makeSupabase({ timezone: 'Asia/Kolkata' });
        vi.setSystemTime(new Date('2026-01-01T20:00:00.000Z'));

        // 20:00 UTC + 5:30 IST offset lands on the next calendar day in Asia/Kolkata
        expect(await resolveUserTodayLocalDate(supabase, 'user-1')).toBe('2026-01-02');
    });

    it('falls back to UTC when the profile has no timezone', async () => {
        const supabase = makeSupabase({ timezone: null });
        vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));

        expect(await resolveUserTodayLocalDate(supabase, 'user-1')).toBe('2026-01-01');
    });

    it('falls back to UTC when the profile row is missing', async () => {
        const supabase = makeSupabase(null);
        vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));

        expect(await resolveUserTodayLocalDate(supabase, 'user-1')).toBe('2026-01-01');
    });

    it('falls back to UTC when the profile timezone is not a real IANA name', async () => {
        const supabase = makeSupabase({ timezone: 'Not/AZone' });
        vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));

        expect(await resolveUserTodayLocalDate(supabase, 'user-1')).toBe('2026-01-01');
    });

    it('queries the profile by the given user id', async () => {
        const supabase = makeSupabase({ timezone: 'UTC' });

        await resolveUserTodayLocalDate(supabase, 'user-42');

        expect(supabase.from).toHaveBeenCalledWith('profiles');
    });
});
