import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createAdminClient = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({ createClient: () => createAdminClient() }));

import { decideSlidingWindowAction, takeSlidingWindowSlot } from './sliding-window-rate-limit';

const NOW = Date.parse('2026-01-01T12:00:00.000Z');
const LIMIT = 5;
const WINDOW_MS = 60 * 60 * 1000;
const CONFIG = { limit: LIMIT, windowMs: WINDOW_MS };

const minutesAgo = (minutes) => new Date(NOW - minutes * 60 * 1000).toISOString();
const rowWith = (count, updatedMinutesAgo, lockedUntil = null) => ({
    failed_count: count,
    locked_until: lockedUntil,
    updated_at: minutesAgo(updatedMinutesAgo),
});

describe('decideSlidingWindowAction', () => {
    it('allows the first attempt for a key and starts the count at 1', () => {
        const decision = decideSlidingWindowAction(null, NOW, CONFIG);

        expect(decision.isAllowed).toBe(true);
        expect(decision.nextRow).toEqual({
            failed_count: 1,
            locked_until: null,
            updated_at: new Date(NOW).toISOString(),
        });
    });

    it('allows attempts up to the limit and locks for one window on the last allowed one', () => {
        const beforeLast = decideSlidingWindowAction(rowWith(LIMIT - 2, 5), NOW, CONFIG);
        expect(beforeLast.nextRow.locked_until).toBeNull();

        const last = decideSlidingWindowAction(rowWith(LIMIT - 1, 5), NOW, CONFIG);
        expect(last.isAllowed).toBe(true);
        expect(last.nextRow.failed_count).toBe(LIMIT);
        expect(Date.parse(last.nextRow.locked_until)).toBe(NOW + WINDOW_MS);
    });

    it('refuses while locked and reports the minutes left, rounded up', () => {
        const lockedUntil = new Date(NOW + 10 * 60 * 1000 + 1).toISOString();

        const decision = decideSlidingWindowAction(rowWith(LIMIT, 50, lockedUntil), NOW, CONFIG);

        expect(decision).toEqual({ isAllowed: false, retryAfterMinutes: 11, nextRow: null });
    });

    it('allows again once the lock has passed and the window is over, restarting the count', () => {
        const decision = decideSlidingWindowAction(
            rowWith(LIMIT, WINDOW_MS / 60_000 + 1, minutesAgo(1)),
            NOW,
            CONFIG,
        );

        expect(decision.isAllowed).toBe(true);
        expect(decision.nextRow.failed_count).toBe(1);
    });

    it('never permanently locks a key out once the window has passed, with no reset event needed', () => {
        // Unlike lib/auth/rate-limit.js's lockout, this must clear itself with no reset event needed
        const decision = decideSlidingWindowAction(rowWith(LIMIT, 90, minutesAgo(65)), NOW, CONFIG);

        expect(decision.isAllowed).toBe(true);
        expect(decision.nextRow.failed_count).toBe(1);
    });

    it('restarts the count when the last attempt for this key was over a window ago', () => {
        const decision = decideSlidingWindowAction(rowWith(2, 90), NOW, CONFIG);

        expect(decision.isAllowed).toBe(true);
        expect(decision.nextRow.failed_count).toBe(1);
    });

    it('refuses a full count with no lock recorded, as a parallel burst could leave behind', () => {
        const decision = decideSlidingWindowAction(rowWith(LIMIT, 20), NOW, CONFIG);

        expect(decision.isAllowed).toBe(false);
        expect(decision.retryAfterMinutes).toBe(40);
    });

    it('treats an unreadable timestamp as no history instead of throwing', () => {
        const decision = decideSlidingWindowAction(
            { failed_count: 5, locked_until: null, updated_at: 'garbage' },
            NOW,
            CONFIG,
        );

        expect(decision.isAllowed).toBe(true);
        expect(decision.nextRow.failed_count).toBe(1);
    });

    it('respects a different limit and window passed in config', () => {
        const decision = decideSlidingWindowAction(rowWith(0, 5), NOW, {
            limit: 1,
            windowMs: 10 * 60 * 1000,
        });

        expect(decision.isAllowed).toBe(true);
        expect(decision.nextRow.failed_count).toBe(1);
        expect(Date.parse(decision.nextRow.locked_until)).toBe(NOW + 10 * 60 * 1000);
    });
});

describe('takeSlidingWindowSlot', () => {
    beforeEach(() => vi.setSystemTime(NOW));
    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    /**
     * Builds a fake admin client for the single `auth_rate_limits` read-then-upsert takeSlidingWindowSlot makes.
     *
     * @param {object} [options]
     * @param {object|null} [options.existingRow] - Row the `maybeSingle` read answers with
     * @param {object|null} [options.readError] - Error the read answers with, instead of a row
     * @param {object|null} [options.writeError] - Error the upsert answers with, instead of succeeding
     * @returns {{ client: object, upsertCalls: object[] }} The client, plus every upsert call for assertions
     */
    function fakeAdminClient({ existingRow = null, readError = null, writeError = null } = {}) {
        const upsertCalls = [];
        const client = {
            from: () => ({
                select: () => ({
                    eq: () => ({
                        eq: () => ({
                            eq: () => ({
                                maybeSingle: async () => ({ data: existingRow, error: readError }),
                            }),
                        }),
                    }),
                }),
                upsert: async (row, options) => {
                    upsertCalls.push({ row, options });
                    return { error: writeError };
                },
            }),
        };
        return { client, upsertCalls };
    }

    const KEY = {
        email: 'guest',
        ipAddress: '1.2.3.4',
        actionType: 'guest_create',
        limit: LIMIT,
        windowMs: WINDOW_MS,
        logLabel: '[guest]',
    };

    it('allows a first attempt and stores a fresh counter under the given key columns', async () => {
        const { client, upsertCalls } = fakeAdminClient();
        createAdminClient.mockReturnValue(client);

        const result = await takeSlidingWindowSlot(KEY);

        expect(result).toEqual({ status: 'allowed', retryAfterMinutes: null });
        expect(upsertCalls).toHaveLength(1);
        expect(upsertCalls[0].row).toMatchObject({
            email: 'guest',
            ip_address: '1.2.3.4',
            action_type: 'guest_create',
            failed_count: 1,
        });
        expect(upsertCalls[0].options).toEqual({ onConflict: 'email,ip_address,action_type' });
    });

    it('refuses once the limit is reached, without writing a row', async () => {
        const { client, upsertCalls } = fakeAdminClient({ existingRow: rowWith(LIMIT, 5) });
        createAdminClient.mockReturnValue(client);

        const result = await takeSlidingWindowSlot(KEY);

        expect(result.status).toBe('limited');
        expect(result.retryAfterMinutes).toBeGreaterThan(0);
        expect(upsertCalls).toHaveLength(0);
    });

    it('refuses while locked, without writing a row', async () => {
        const lockedUntil = new Date(NOW + 5 * 60 * 1000).toISOString();
        const { client, upsertCalls } = fakeAdminClient({
            existingRow: rowWith(LIMIT, 50, lockedUntil),
        });
        createAdminClient.mockReturnValue(client);

        const result = await takeSlidingWindowSlot(KEY);

        expect(result.status).toBe('limited');
        expect(upsertCalls).toHaveLength(0);
    });

    it('fails closed when the counter cannot be read, logging the detail', async () => {
        const { client, upsertCalls } = fakeAdminClient({ readError: { message: 'offline' } });
        createAdminClient.mockReturnValue(client);
        vi.spyOn(console, 'error').mockImplementation(() => {});

        const result = await takeSlidingWindowSlot(KEY);

        expect(result).toEqual({ status: 'unavailable', retryAfterMinutes: null });
        expect(upsertCalls).toHaveLength(0);
        expect(console.error).toHaveBeenCalledWith(
            '[guest] rate limit read failed',
            expect.objectContaining({ detail: 'offline' }),
        );
    });

    it('fails closed when the counter cannot be written, even though the attempt was allowed', async () => {
        const { client } = fakeAdminClient({ writeError: { message: 'offline' } });
        createAdminClient.mockReturnValue(client);
        vi.spyOn(console, 'error').mockImplementation(() => {});

        const result = await takeSlidingWindowSlot(KEY);

        expect(result).toEqual({ status: 'unavailable', retryAfterMinutes: null });
        expect(console.error).toHaveBeenCalledWith(
            '[guest] rate limit write failed',
            expect.objectContaining({ detail: 'offline' }),
        );
    });

    it('scopes the counter to the action type, so two callers never share a key by accident', async () => {
        const { client, upsertCalls } = fakeAdminClient();
        createAdminClient.mockReturnValue(client);

        await takeSlidingWindowSlot({
            ...KEY,
            email: 'sender@example.com',
            actionType: 'space_invite',
        });

        expect(upsertCalls[0].row).toMatchObject({
            email: 'sender@example.com',
            action_type: 'space_invite',
        });
    });
});
