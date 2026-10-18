import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from './test-support/fake-supabase';

const OWNER_ID = 'user-owner';
const STRANGER_ID = 'user-stranger';
const TODAY = '2026-10-18';

let fake;
let tables;
let currentUserId;

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fake.client }));
vi.mock('@/lib/auth/session', () => ({
    getCurrentUser: async () => currentUserId && { id: currentUserId },
}));

function buildHabitRow(id, overrides = {}) {
    return {
        id,
        user_id: OWNER_ID,
        category_id: null,
        title: `Title of ${id}`,
        description: null,
        color: '#111111',
        position: 0,
        polarity: 'build',
        measure_kind: 'binary',
        target_value: null,
        unit_code: null,
        recurrence: { kind: 'daily' },
        started_on: TODAY,
        ...overrides,
    };
}

function setUpWorld({ habits, entries, profile, fakeOptions } = {}) {
    tables = {
        habits: habits ?? [buildHabitRow('habit-1')],
        habit_entries: entries ?? [],
        profiles: [profile ?? { id: OWNER_ID, timezone: 'UTC' }],
    };
    fake = createFakeSupabase({ tables, getCallerId: () => currentUserId, ...fakeOptions });
}

async function habitEntryActions() {
    return import('./habit-entry-actions');
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${TODAY}T12:00:00.000Z`));
    currentUserId = OWNER_ID;
    setUpWorld();
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('toggleHabitCheckIn', () => {
    it('needs a habit id', async () => {
        const { toggleHabitCheckIn } = await habitEntryActions();

        expect(await toggleHabitCheckIn('')).toEqual({
            data: null,
            error: 'Habit ID is required',
            code: 'HABIT_ID_REQUIRED',
        });
    });

    it('refuses a signed-out caller with the stable auth code', async () => {
        currentUserId = null;
        const { toggleHabitCheckIn } = await habitEntryActions();

        expect(await toggleHabitCheckIn('habit-1')).toMatchObject({
            data: null,
            code: 'NOT_AUTHENTICATED',
        });
    });

    it('treats another user’s habit as not found, same as a missing one', async () => {
        currentUserId = STRANGER_ID;
        const { toggleHabitCheckIn } = await habitEntryActions();

        expect(await toggleHabitCheckIn('habit-1')).toEqual({
            data: null,
            error: 'Habit not found',
            code: 'HABIT_NOT_FOUND',
        });
    });

    it('logs today’s check-in with value 1 for a binary habit with none logged yet', async () => {
        const { toggleHabitCheckIn } = await habitEntryActions();

        const toggleResult = await toggleHabitCheckIn('habit-1');

        expect(toggleResult.error).toBeNull();
        expect(toggleResult.data).toMatchObject({
            habit_id: 'habit-1',
            local_date: TODAY,
            value: 1,
        });
    });

    it('logs the habit’s target value for a count habit, since there is no stepper input yet', async () => {
        setUpWorld({
            habits: [
                buildHabitRow('habit-1', {
                    measure_kind: 'count',
                    target_value: 20,
                    unit_code: null,
                }),
            ],
        });
        const { toggleHabitCheckIn } = await habitEntryActions();

        const toggleResult = await toggleHabitCheckIn('habit-1');

        expect(toggleResult.data).toMatchObject({ value: 20 });
    });

    it('undoes today’s check-in on a second toggle', async () => {
        setUpWorld({
            entries: [
                {
                    id: 'entry-1',
                    habit_id: 'habit-1',
                    user_id: OWNER_ID,
                    local_date: TODAY,
                    value: 1,
                },
            ],
        });
        const { toggleHabitCheckIn } = await habitEntryActions();

        const toggleResult = await toggleHabitCheckIn('habit-1');

        expect(toggleResult).toEqual({ data: null, error: null });
        expect(tables.habit_entries).toHaveLength(0);
    });

    it('maps a guest-limit error on insert to the friendly result', async () => {
        setUpWorld({
            fakeOptions: {
                insertError: { code: 'P0001', message: 'GUEST_LIMIT_REACHED:habit_entries' },
            },
        });
        const { toggleHabitCheckIn } = await habitEntryActions();

        const toggleResult = await toggleHabitCheckIn('habit-1');

        expect(toggleResult.data).toBeNull();
        expect(toggleResult.error).toContain('Guest mode is limited');
    });

    it('maps a rate-limit error on insert to the friendly result', async () => {
        setUpWorld({
            fakeOptions: {
                insertError: { code: 'P0001', message: 'HABIT_ENTRY_WRITE_RATE_LIMITED:minute' },
            },
        });
        const { toggleHabitCheckIn } = await habitEntryActions();

        const toggleResult = await toggleHabitCheckIn('habit-1');

        expect(toggleResult.data).toBeNull();
        expect(toggleResult.code).toBe('HABIT_ENTRY_RATE_LIMITED');
    });

    it('maps a rate-limit error on undo (delete) to the friendly result', async () => {
        setUpWorld({
            entries: [
                {
                    id: 'entry-1',
                    habit_id: 'habit-1',
                    user_id: OWNER_ID,
                    local_date: TODAY,
                    value: 1,
                },
            ],
            fakeOptions: {
                deleteError: { code: 'P0001', message: 'HABIT_ENTRY_WRITE_RATE_LIMITED:hour' },
            },
        });
        const { toggleHabitCheckIn } = await habitEntryActions();

        const toggleResult = await toggleHabitCheckIn('habit-1');

        expect(toggleResult.data).toBeNull();
        expect(toggleResult.code).toBe('HABIT_ENTRY_RATE_LIMITED');
    });

    it('hides a generic insert failure behind a fixed message', async () => {
        setUpWorld({ fakeOptions: { insertError: { code: 'XX000', message: 'boom' } } });
        const { toggleHabitCheckIn } = await habitEntryActions();

        expect(await toggleHabitCheckIn('habit-1')).toEqual({
            data: null,
            error: 'Failed to log check-in',
        });
    });

    it('hides a generic delete failure behind a fixed message', async () => {
        setUpWorld({
            entries: [
                {
                    id: 'entry-1',
                    habit_id: 'habit-1',
                    user_id: OWNER_ID,
                    local_date: TODAY,
                    value: 1,
                },
            ],
            fakeOptions: { deleteError: { code: 'XX000', message: 'boom' } },
        });
        const { toggleHabitCheckIn } = await habitEntryActions();

        expect(await toggleHabitCheckIn('habit-1')).toEqual({
            data: null,
            error: 'Failed to undo check-in',
        });
    });
});
