import { describe, expect, it, vi } from 'vitest';
import { loadTimeSessionForWrite } from './load-time-session-for-write';

const NOT_FOUND_FAILURE = { error: 'Session not found', code: 'TIME_SESSION_NOT_FOUND' };

/**
 * Fake Supabase client whose `time_sessions` select resolves to one row (or none).
 *
 * @param {object|null} session - Row `maybeSingle()` resolves to, or null for no visible row.
 * @returns {object} A `from`-only fake client, plus the `eq` spy for assertions.
 */
function makeSupabase(session) {
    const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({ data: session })),
    };
    return { from: vi.fn(() => query), query };
}

describe('loadTimeSessionForWrite', () => {
    it('returns the session when it is visible to the caller', async () => {
        const session = { id: 'session-1', status: 'running' };
        const supabase = makeSupabase(session);

        expect(await loadTimeSessionForWrite(supabase, 'session-1', NOT_FOUND_FAILURE)).toEqual({
            session,
            failure: null,
        });
    });

    it('returns the not-found failure when nothing is visible - unknown id or another user’s row alike', async () => {
        const supabase = makeSupabase(null);

        expect(
            await loadTimeSessionForWrite(supabase, 'session-missing', NOT_FOUND_FAILURE),
        ).toEqual({
            session: null,
            failure: NOT_FOUND_FAILURE,
        });
    });

    it('filters by the given id', async () => {
        const { from, query } = makeSupabase({ id: 'session-1' });

        await loadTimeSessionForWrite({ from }, 'session-1', NOT_FOUND_FAILURE);

        expect(query.eq).toHaveBeenCalledWith('id', 'session-1');
    });
});
