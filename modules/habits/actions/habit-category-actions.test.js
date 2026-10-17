import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from './test-support/fake-supabase';

const OWNER_ID = 'user-owner';
const STRANGER_ID = 'user-stranger';
const CLIENT_ID = '3f2b1c4e-5d6a-4b7c-8d9e-0a1b2c3d4e5f';

let fake;
let tables;
let currentUserId;

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fake.client }));
vi.mock('@/lib/auth/session', () => ({
    getCurrentUser: async () => currentUserId && { id: currentUserId },
}));

function buildCategoryRow(id, overrides = {}) {
    return {
        id,
        user_id: OWNER_ID,
        name: `Name of ${id}`,
        color: '#111111',
        position: 0,
        ...overrides,
    };
}

function setUpWorld({ categories, fakeOptions } = {}) {
    tables = {
        habit_categories: categories ?? [
            buildCategoryRow('category-1', { position: 0 }),
            buildCategoryRow('category-2', { position: 1 }),
        ],
    };
    fake = createFakeSupabase({ tables, getCallerId: () => currentUserId, ...fakeOptions });
}

async function categoryActions() {
    return import('./habit-category-actions');
}

const storedCategory = (id) => tables.habit_categories.find((category) => category.id === id);

beforeEach(() => {
    currentUserId = OWNER_ID;
    setUpWorld();
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('createHabitCategory', () => {
    it('refuses a signed-out caller with the stable auth code', async () => {
        currentUserId = null;
        const { createHabitCategory } = await categoryActions();

        expect(await createHabitCategory({ name: 'Health' })).toMatchObject({
            data: null,
            code: 'NOT_AUTHENTICATED',
        });
    });

    it('stores a trimmed, tag-free name after the caller’s last category, with the default colour', async () => {
        const { createHabitCategory } = await categoryActions();

        const createResult = await createHabitCategory({ name: '  <b>Health</b> ' });

        expect(createResult.error).toBeNull();
        expect(createResult.data).toMatchObject({
            name: 'Health',
            color: '#6b7280',
            position: 2,
            user_id: OWNER_ID,
        });
    });

    it('keeps the colour the caller sent', async () => {
        const { createHabitCategory } = await categoryActions();

        const createResult = await createHabitCategory({ name: 'Health', color: '#ff0000' });

        expect(createResult.data.color).toBe('#ff0000');
    });

    it('refuses an empty name and writes nothing', async () => {
        const { createHabitCategory } = await categoryActions();

        expect(await createHabitCategory({ name: '   ' })).toMatchObject({
            data: null,
            code: 'HABIT_CATEGORY_NAME_REQUIRED',
        });
        expect(fake.inserts).toHaveLength(0);
    });

    it.each(['red', '#fff', 42])(
        'refuses the colour %j with the colour code and writes nothing',
        async (color) => {
            const { createHabitCategory } = await categoryActions();

            expect(await createHabitCategory({ name: 'Health', color })).toMatchObject({
                data: null,
                code: 'HABIT_COLOR_INVALID',
            });
            expect(fake.inserts).toHaveLength(0);
        },
    );

    it('writes only the allowed fields', async () => {
        const { createHabitCategory } = await categoryActions();

        await createHabitCategory({ name: 'Health', not_a_real_column: 'x' });

        const [{ values }] = fake.inserts;
        expect(Object.keys(values).sort()).toEqual(['color', 'name', 'position', 'user_id']);
    });

    it('refuses a client id that is not a uuid', async () => {
        const { createHabitCategory } = await categoryActions();

        expect(await createHabitCategory({ id: 'nope', name: 'Health' })).toMatchObject({
            data: null,
            code: 'INVALID_REQUEST_ID',
        });
        expect(fake.inserts).toHaveLength(0);
    });

    it('returns the first try’s own row for a repeated client id, without inserting again', async () => {
        tables.habit_categories.push(buildCategoryRow(CLIENT_ID, { name: 'First try' }));
        const { createHabitCategory } = await categoryActions();

        const createResult = await createHabitCategory({ id: CLIENT_ID, name: 'Second try' });

        expect(createResult).toMatchObject({
            error: null,
            data: { id: CLIENT_ID, name: 'First try' },
        });
        expect(fake.inserts).toHaveLength(0);
    });

    it('turns a duplicate name into the name-taken failure', async () => {
        setUpWorld({ fakeOptions: { insertError: { code: '23505', message: 'duplicate key' } } });
        const { createHabitCategory } = await categoryActions();

        expect(await createHabitCategory({ name: 'Health' })).toMatchObject({
            data: null,
            code: 'HABIT_CATEGORY_NAME_TAKEN',
        });
    });

    it('turns a guest limit error into the friendly guest result', async () => {
        setUpWorld({
            fakeOptions: {
                insertError: { code: 'P0001', message: 'GUEST_LIMIT_REACHED:habit_categories' },
            },
        });
        const { createHabitCategory } = await categoryActions();

        const createResult = await createHabitCategory({ name: 'Health' });

        expect(createResult.data).toBeNull();
        expect(createResult.error).toContain('Guest mode is limited');
        expect(createResult.code).toBeTruthy();
    });

    it('hides a database failure behind a fixed message', async () => {
        setUpWorld({
            fakeOptions: { insertError: { code: 'XX000', message: 'relation exploded' } },
        });
        const { createHabitCategory } = await categoryActions();

        expect(await createHabitCategory({ name: 'Health' })).toEqual({
            data: null,
            error: 'Failed to create category',
        });
    });

    it('only counts the caller’s own categories toward the next position', async () => {
        setUpWorld({
            categories: [
                buildCategoryRow('category-mine', { position: 0 }),
                buildCategoryRow('category-theirs', { user_id: STRANGER_ID, position: 9 }),
            ],
        });
        const { createHabitCategory } = await categoryActions();

        const createResult = await createHabitCategory({ name: 'Health' });

        expect(createResult.data.position).toBe(1);
    });
});

describe('updateHabitCategory', () => {
    it('needs a category id', async () => {
        const { updateHabitCategory } = await categoryActions();

        expect(await updateHabitCategory('', { name: 'New' })).toEqual({
            data: null,
            error: 'Category ID is required',
            code: 'HABIT_CATEGORY_ID_REQUIRED',
        });
    });

    it('saves a trimmed name, a colour and a position', async () => {
        const { updateHabitCategory } = await categoryActions();

        const updateResult = await updateHabitCategory('category-1', {
            name: ' <b>Later</b> ',
            color: '#00ff00',
            position: 9,
        });

        expect(updateResult.error).toBeNull();
        expect(storedCategory('category-1')).toMatchObject({
            name: 'Later',
            color: '#00ff00',
            position: 9,
        });
    });

    it('writes only the fields that were sent', async () => {
        const { updateHabitCategory } = await categoryActions();

        await updateHabitCategory('category-1', { color: '#00ff00' });

        expect(fake.updates).toEqual([
            { tableName: 'habit_categories', values: { color: '#00ff00' } },
        ]);
    });

    it('refuses an invalid colour and writes nothing', async () => {
        const { updateHabitCategory } = await categoryActions();

        expect(await updateHabitCategory('category-1', { color: 'red' })).toMatchObject({
            data: null,
            code: 'HABIT_COLOR_INVALID',
        });
        expect(fake.updates).toHaveLength(0);
    });

    it('says the category was not found for an unknown id', async () => {
        const { updateHabitCategory } = await categoryActions();

        expect(await updateHabitCategory('category-missing', { name: 'New' })).toEqual({
            data: null,
            error: 'Category not found',
            code: 'HABIT_CATEGORY_NOT_FOUND',
        });
    });

    it('never lets a caller update another user’s category - it is not visible, so it reads as not found', async () => {
        setUpWorld({
            categories: [buildCategoryRow('category-theirs', { user_id: STRANGER_ID })],
        });
        const { updateHabitCategory } = await categoryActions();

        expect(await updateHabitCategory('category-theirs', { name: 'Mine now' })).toEqual({
            data: null,
            error: 'Category not found',
            code: 'HABIT_CATEGORY_NOT_FOUND',
        });
    });

    it('turns a duplicate name into the name-taken failure', async () => {
        setUpWorld({ fakeOptions: { updateError: { code: '23505', message: 'duplicate key' } } });
        const { updateHabitCategory } = await categoryActions();

        expect(await updateHabitCategory('category-1', { name: 'Health' })).toMatchObject({
            data: null,
            code: 'HABIT_CATEGORY_NAME_TAKEN',
        });
    });
});

describe('deleteHabitCategory', () => {
    it('needs a category id', async () => {
        const { deleteHabitCategory } = await categoryActions();

        expect(await deleteHabitCategory('')).toEqual({
            error: 'Category ID is required',
            code: 'HABIT_CATEGORY_ID_REQUIRED',
        });
    });

    it('deletes a category', async () => {
        const { deleteHabitCategory } = await categoryActions();

        expect(await deleteHabitCategory('category-1')).toEqual({ error: null });
        expect(storedCategory('category-1')).toBeUndefined();
    });

    it('says not found for an unknown id', async () => {
        const { deleteHabitCategory } = await categoryActions();

        expect(await deleteHabitCategory('category-missing')).toEqual({
            error: 'Category not found',
            code: 'HABIT_CATEGORY_NOT_FOUND',
        });
    });

    it('never lets a caller delete another user’s category', async () => {
        setUpWorld({
            categories: [buildCategoryRow('category-theirs', { user_id: STRANGER_ID })],
        });
        const { deleteHabitCategory } = await categoryActions();

        expect(await deleteHabitCategory('category-theirs')).toEqual({
            error: 'Category not found',
            code: 'HABIT_CATEGORY_NOT_FOUND',
        });
        expect(storedCategory('category-theirs')).toBeDefined();
    });
});
