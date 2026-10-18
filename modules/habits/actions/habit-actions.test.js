import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from './test-support/fake-supabase';

const OWNER_ID = 'user-owner';
const STRANGER_ID = 'user-stranger';
const CLIENT_ID = '3f2b1c4e-5d6a-4b7c-8d9e-0a1b2c3d4e5f';
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

function setUpWorld({ habits, categories, profile, fakeOptions } = {}) {
    tables = {
        habits: habits ?? [buildHabitRow('habit-1', { position: 0 })],
        habit_categories: categories ?? [],
        profiles: [profile ?? { id: OWNER_ID, timezone: 'UTC' }],
    };
    fake = createFakeSupabase({ tables, getCallerId: () => currentUserId, ...fakeOptions });
}

async function habitActions() {
    return import('./habit-actions');
}

const storedHabit = (id) => tables.habits.find((habit) => habit.id === id);

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

describe('createHabit', () => {
    it('refuses a signed-out caller with the stable auth code', async () => {
        currentUserId = null;
        const { createHabit } = await habitActions();

        expect(await createHabit({ title: 'Read' })).toMatchObject({
            data: null,
            code: 'NOT_AUTHENTICATED',
        });
    });

    it('creates a binary habit from just a title, filling in every other default', async () => {
        const { createHabit } = await habitActions();

        const createResult = await createHabit({ title: '  <b>Read</b> ' });

        expect(createResult.error).toBeNull();
        expect(createResult.data).toMatchObject({
            title: 'Read',
            description: null,
            color: '#6b7280',
            polarity: 'build',
            measure_kind: 'binary',
            target_value: null,
            unit_code: null,
            recurrence: { kind: 'daily' },
            started_on: TODAY,
            position: 1,
            user_id: OWNER_ID,
        });
    });

    it('refuses a missing title and writes nothing', async () => {
        const { createHabit } = await habitActions();

        expect(await createHabit({})).toMatchObject({ data: null, code: 'HABIT_TITLE_REQUIRED' });
        expect(fake.inserts).toHaveLength(0);
    });

    it('requires and validates a target value for a count habit', async () => {
        const { createHabit } = await habitActions();

        expect(await createHabit({ title: 'Push-ups', measure_kind: 'count' })).toMatchObject({
            data: null,
            code: 'HABIT_TARGET_VALUE_REQUIRED',
        });

        const createResult = await createHabit({
            title: 'Push-ups',
            measure_kind: 'count',
            target_value: 20,
        });
        expect(createResult.data).toMatchObject({ measure_kind: 'count', target_value: 20 });
    });

    it('requires a unit for a quantity habit, scoped to the right dimension', async () => {
        const { createHabit } = await habitActions();

        expect(
            await createHabit({
                title: 'Walk',
                measure_kind: 'quantity',
                target_value: 5,
                unit_code: 'sec',
            }),
        ).toMatchObject({ data: null, code: 'HABIT_UNIT_CODE_INVALID' });

        const createResult = await createHabit({
            title: 'Walk',
            measure_kind: 'quantity',
            target_value: 5,
            unit_code: 'km',
        });
        expect(createResult.data).toMatchObject({ measure_kind: 'quantity', unit_code: 'km' });
    });

    it('accepts a free-text custom unit when none of the built-ins fit (decision B3.1)', async () => {
        const { createHabit } = await habitActions();

        const createResult = await createHabit({
            title: 'Drink water',
            measure_kind: 'quantity',
            target_value: 8,
            unit_code: 'cups',
        });

        expect(createResult.data).toMatchObject({ measure_kind: 'quantity', unit_code: 'cups' });
    });

    it('refuses a target value on a binary habit', async () => {
        const { createHabit } = await habitActions();

        expect(
            await createHabit({ title: 'Read', measure_kind: 'binary', target_value: 1 }),
        ).toMatchObject({ data: null, code: 'HABIT_TARGET_VALUE_NOT_ALLOWED' });
    });

    it('validates a recurrence rule against its own kind', async () => {
        const { createHabit } = await habitActions();

        expect(
            await createHabit({ title: 'Gym', recurrence: { kind: 'times_per_week', count: 9 } }),
        ).toMatchObject({ data: null, code: 'HABIT_RECURRENCE_INVALID' });

        const createResult = await createHabit({
            title: 'Gym',
            recurrence: { kind: 'times_per_week', count: 3 },
        });
        expect(createResult.data.recurrence).toEqual({ kind: 'times_per_week', count: 3 });
    });

    it('refuses a start date in the future', async () => {
        const { createHabit } = await habitActions();

        expect(await createHabit({ title: 'Read', started_on: '2026-10-19' })).toMatchObject({
            data: null,
            code: 'HABIT_ENTRY_DATE_IN_FUTURE',
        });
    });

    it('accepts a category the caller owns', async () => {
        setUpWorld({ categories: [{ id: 'category-1', user_id: OWNER_ID, name: 'Health' }] });
        const { createHabit } = await habitActions();

        const createResult = await createHabit({ title: 'Read', category_id: 'category-1' });

        expect(createResult.data.category_id).toBe('category-1');
    });

    it('refuses a category id that is not the caller’s own', async () => {
        setUpWorld({ categories: [{ id: 'category-1', user_id: STRANGER_ID, name: 'Theirs' }] });
        const { createHabit } = await habitActions();

        expect(await createHabit({ title: 'Read', category_id: 'category-1' })).toMatchObject({
            data: null,
            code: 'HABIT_CATEGORY_NOT_FOUND',
        });
        expect(fake.inserts).toHaveLength(0);
    });

    it('refuses an unrecognised category id with a not-found code, never throwing on the lookup', async () => {
        const { createHabit } = await habitActions();

        expect(await createHabit({ title: 'Read', category_id: 'category-missing' })).toMatchObject(
            { data: null, code: 'HABIT_CATEGORY_NOT_FOUND' },
        );
    });

    it('writes only the allowed fields', async () => {
        const { createHabit } = await habitActions();

        await createHabit({ title: 'Read', not_a_real_column: 'x' });

        const [{ values }] = fake.inserts;
        expect(Object.keys(values).sort()).toEqual(
            [
                'category_id',
                'color',
                'description',
                'measure_kind',
                'polarity',
                'position',
                'recurrence',
                'started_on',
                'target_value',
                'title',
                'unit_code',
                'user_id',
            ].sort(),
        );
    });

    it('refuses a client id that is not a uuid', async () => {
        const { createHabit } = await habitActions();

        expect(await createHabit({ id: 'nope', title: 'Read' })).toMatchObject({
            data: null,
            code: 'INVALID_REQUEST_ID',
        });
        expect(fake.inserts).toHaveLength(0);
    });

    it('returns the first try’s own row for a repeated client id, without inserting again', async () => {
        tables.habits.push(buildHabitRow(CLIENT_ID, { title: 'First try' }));
        const { createHabit } = await habitActions();

        const createResult = await createHabit({ id: CLIENT_ID, title: 'Second try' });

        expect(createResult).toMatchObject({
            error: null,
            data: { id: CLIENT_ID, title: 'First try' },
        });
        expect(fake.inserts).toHaveLength(0);
    });

    it('turns a guest limit error into the friendly guest result', async () => {
        setUpWorld({
            fakeOptions: { insertError: { code: 'P0001', message: 'GUEST_LIMIT_REACHED:habits' } },
        });
        const { createHabit } = await habitActions();

        const createResult = await createHabit({ title: 'Read' });

        expect(createResult.data).toBeNull();
        expect(createResult.error).toContain('Guest mode is limited');
        expect(createResult.code).toBeTruthy();
    });

    it('hides a database failure behind a fixed message', async () => {
        setUpWorld({ fakeOptions: { insertError: { code: 'XX000', message: 'boom' } } });
        const { createHabit } = await habitActions();

        expect(await createHabit({ title: 'Read' })).toEqual({
            data: null,
            error: 'Failed to create habit',
        });
    });

    it('only counts the caller’s own habits toward the next position', async () => {
        setUpWorld({
            habits: [
                buildHabitRow('habit-mine', { position: 0 }),
                buildHabitRow('habit-theirs', { user_id: STRANGER_ID, position: 9 }),
            ],
        });
        const { createHabit } = await habitActions();

        const createResult = await createHabit({ title: 'Read' });

        expect(createResult.data.position).toBe(1);
    });
});

describe('updateHabit', () => {
    it('needs a habit id', async () => {
        const { updateHabit } = await habitActions();

        expect(await updateHabit('', { title: 'New' })).toEqual({
            data: null,
            error: 'Habit ID is required',
            code: 'HABIT_ID_REQUIRED',
        });
    });

    it('says the habit was not found for an unknown id', async () => {
        const { updateHabit } = await habitActions();

        expect(await updateHabit('habit-missing', { title: 'New' })).toEqual({
            data: null,
            error: 'Habit not found',
            code: 'HABIT_NOT_FOUND',
        });
    });

    it('never lets a caller update another user’s habit - it is not visible, so it reads as not found', async () => {
        setUpWorld({ habits: [buildHabitRow('habit-theirs', { user_id: STRANGER_ID })] });
        const { updateHabit } = await habitActions();

        expect(await updateHabit('habit-theirs', { title: 'Mine now' })).toMatchObject({
            data: null,
            code: 'HABIT_NOT_FOUND',
        });
    });

    it('writes only the fields that were sent', async () => {
        const { updateHabit } = await habitActions();

        await updateHabit('habit-1', { title: 'New title' });

        expect(fake.updates).toEqual([{ tableName: 'habits', values: { title: 'New title' } }]);
    });

    it('re-checks the target value against a newly-changing measure kind', async () => {
        const { updateHabit } = await habitActions();

        expect(await updateHabit('habit-1', { measure_kind: 'count' })).toMatchObject({
            data: null,
            code: 'HABIT_TARGET_VALUE_REQUIRED',
        });

        const updateResult = await updateHabit('habit-1', {
            measure_kind: 'count',
            target_value: 10,
        });
        expect(updateResult.data).toMatchObject({ measure_kind: 'count', target_value: 10 });
    });

    it('clears a stale target value and unit when switching to binary, not reusing the old ones', async () => {
        setUpWorld({
            habits: [
                buildHabitRow('habit-1', {
                    measure_kind: 'quantity',
                    target_value: 10,
                    unit_code: 'km',
                }),
            ],
        });
        const { updateHabit } = await habitActions();

        const updateResult = await updateHabit('habit-1', { measure_kind: 'binary' });

        expect(updateResult.error).toBeNull();
        expect(updateResult.data).toMatchObject({
            measure_kind: 'binary',
            target_value: null,
            unit_code: null,
        });
    });

    it('does not carry a stale unit over when switching to a measure kind that forbids one', async () => {
        setUpWorld({
            habits: [
                buildHabitRow('habit-1', {
                    measure_kind: 'quantity',
                    target_value: 10,
                    unit_code: 'km',
                }),
            ],
        });
        const { updateHabit } = await habitActions();

        const updateResult = await updateHabit('habit-1', {
            measure_kind: 'count',
            target_value: 20,
        });

        expect(updateResult.error).toBeNull();
        expect(updateResult.data).toMatchObject({ measure_kind: 'count', unit_code: null });
    });

    it('re-checks an unrelated field against the habit’s existing measure kind', async () => {
        setUpWorld({
            habits: [buildHabitRow('habit-1', { measure_kind: 'count', target_value: 5 })],
        });
        const { updateHabit } = await habitActions();

        expect(await updateHabit('habit-1', { target_value: -1 })).toMatchObject({
            data: null,
            code: 'HABIT_TARGET_VALUE_INVALID',
        });
    });

    it('keeps the existing target value when only an unrelated field changes', async () => {
        setUpWorld({
            habits: [buildHabitRow('habit-1', { measure_kind: 'count', target_value: 5 })],
        });
        const { updateHabit } = await habitActions();

        await updateHabit('habit-1', { title: 'New title' });

        expect(fake.updates).toEqual([{ tableName: 'habits', values: { title: 'New title' } }]);
        expect(storedHabit('habit-1').target_value).toBe(5);
    });

    it('accepts a category the caller owns, and clears it with null', async () => {
        setUpWorld({
            habits: [buildHabitRow('habit-1', { category_id: null })],
            categories: [{ id: 'category-1', user_id: OWNER_ID, name: 'Health' }],
        });
        const { updateHabit } = await habitActions();

        expect((await updateHabit('habit-1', { category_id: 'category-1' })).data).toMatchObject({
            category_id: 'category-1',
        });
        expect((await updateHabit('habit-1', { category_id: null })).data).toMatchObject({
            category_id: null,
        });
    });

    it('refuses a category id that is not the caller’s own, writing nothing', async () => {
        setUpWorld({ categories: [{ id: 'category-1', user_id: STRANGER_ID, name: 'Theirs' }] });
        const { updateHabit } = await habitActions();

        expect(await updateHabit('habit-1', { category_id: 'category-1' })).toMatchObject({
            data: null,
            code: 'HABIT_CATEGORY_NOT_FOUND',
        });
        expect(fake.updates).toHaveLength(0);
    });

    it('returns the habit unchanged when nothing was sent', async () => {
        const { updateHabit } = await habitActions();

        const updateResult = await updateHabit('habit-1', {});

        expect(updateResult.error).toBeNull();
        expect(updateResult.data).toMatchObject({ id: 'habit-1' });
        expect(fake.updates).toHaveLength(0);
    });

    it('hides a database failure behind a fixed message', async () => {
        setUpWorld({ fakeOptions: { updateError: { code: 'XX000', message: 'boom' } } });
        const { updateHabit } = await habitActions();

        expect(await updateHabit('habit-1', { title: 'New' })).toEqual({
            data: null,
            error: 'Failed to update habit',
        });
    });
});

describe('deleteHabit', () => {
    it('needs a habit id', async () => {
        const { deleteHabit } = await habitActions();

        expect(await deleteHabit('')).toEqual({
            error: 'Habit ID is required',
            code: 'HABIT_ID_REQUIRED',
        });
    });

    it('deletes a habit', async () => {
        const { deleteHabit } = await habitActions();

        expect(await deleteHabit('habit-1')).toEqual({ error: null });
        expect(storedHabit('habit-1')).toBeUndefined();
    });

    it('says not found for an unknown id', async () => {
        const { deleteHabit } = await habitActions();

        expect(await deleteHabit('habit-missing')).toEqual({
            error: 'Habit not found',
            code: 'HABIT_NOT_FOUND',
        });
    });

    it('never lets a caller delete another user’s habit', async () => {
        setUpWorld({ habits: [buildHabitRow('habit-theirs', { user_id: STRANGER_ID })] });
        const { deleteHabit } = await habitActions();

        expect(await deleteHabit('habit-theirs')).toEqual({
            error: 'Habit not found',
            code: 'HABIT_NOT_FOUND',
        });
        expect(storedHabit('habit-theirs')).toBeDefined();
    });
});
