import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from './test-support/fake-supabase';
import { buildTaskTables, COLLABORATOR_ID, OWNER_ID } from './test-support/task-fixtures';

let fake;
let currentUserId;

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fake.client }));
vi.mock('@/lib/auth/session', () => ({
    getCurrentUser: async () => currentUserId && { id: currentUserId },
}));

const VALID_FIELDS = { title: 'Buy milk', list_id: 'list-1' };

async function createTaskWith(fields, { tablesOptions, fakeOptions } = {}) {
    fake = createFakeSupabase({
        tables: buildTaskTables(tablesOptions),
        getCallerId: () => currentUserId,
        ...fakeOptions,
    });
    const { createTask } = await import('./task-create-actions');
    return createTask(fields);
}

describe('createTask checks, in the order a caller meets them', () => {
    beforeEach(() => {
        currentUserId = OWNER_ID;
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => vi.restoreAllMocks());

    it('refuses a signed-out caller with the stable auth code', async () => {
        currentUserId = null;

        const createResult = await createTaskWith(VALID_FIELDS);

        expect(createResult).toMatchObject({ data: null, code: 'NOT_AUTHENTICATED' });
        expect(fake.inserts).toHaveLength(0);
    });

    it.each([
        ['a missing title', { title: undefined }, 'Title is required'],
        ['a title of only spaces and tags', { title: '  <b></b> ' }, 'Title is required'],
        ['a title over 200 characters', { title: 'x'.repeat(201) }, /Title cannot exceed 200/],
        [
            'a description over 10000 characters',
            { description: 'x'.repeat(10001) },
            /Description cannot exceed 10000/,
        ],
        ['a missing list', { list_id: undefined }, 'A list is required'],
        [
            'a subtask that names a sublist',
            { parent_id: 'task-1', sublist_id: 'sublist-1' },
            "A subtask can't belong to a sublist directly",
        ],
    ])('rejects %s before anything is written', async (label, overrides, expectedError) => {
        const createResult = await createTaskWith({ ...VALID_FIELDS, ...overrides });

        expect(createResult.data).toBeNull();
        expect(createResult.error).toMatch(expectedError);
        expect(fake.inserts).toHaveLength(0);
    });

    it('refuses a read-only collaborator with the permission code', async () => {
        currentUserId = COLLABORATOR_ID;

        const createResult = await createTaskWith(VALID_FIELDS, {
            tablesOptions: { collaboratorLevel: 'read_only' },
        });

        expect(createResult).toMatchObject({ data: null, code: 'PERMISSION_READ_ONLY' });
        expect(fake.inserts).toHaveLength(0);
    });

    it('refuses someone who is not in the space', async () => {
        currentUserId = 'user-stranger';

        const createResult = await createTaskWith(VALID_FIELDS);

        expect(createResult).toMatchObject({ data: null, code: 'PERMISSION_NOT_A_MEMBER' });
    });

    it('lets a restricted collaborator create', async () => {
        currentUserId = COLLABORATOR_ID;

        const createResult = await createTaskWith(VALID_FIELDS, {
            tablesOptions: { collaboratorLevel: 'restricted' },
        });

        expect(createResult.error).toBeNull();
        expect(createResult.data.created_by).toBe(COLLABORATOR_ID);
    });

    it('requires a due date when the space asks for one', async () => {
        const createResult = await createTaskWith(VALID_FIELDS, {
            tablesOptions: { space: { require_due_date: true } },
        });

        expect(createResult).toMatchObject({ data: null, code: 'TASK_DUE_DATE_REQUIRED' });
        expect(fake.inserts).toHaveLength(0);
    });

    it('accepts a due date when the space asks for one', async () => {
        const createResult = await createTaskWith(
            { ...VALID_FIELDS, due_date: '2026-03-01' },
            { tablesOptions: { space: { require_due_date: true } } },
        );

        expect(createResult.error).toBeNull();
        expect(createResult.data.due_date).toBe('2026-03-01');
    });

    it('rejects a priority that is not a real boolean', async () => {
        const createResult = await createTaskWith({ ...VALID_FIELDS, is_prioritised: 'false' });

        expect(createResult).toMatchObject({ data: null, code: 'TASK_INVALID_PRIORITY' });
        expect(fake.inserts).toHaveLength(0);
    });

    it('rejects a sublist that belongs to another list', async () => {
        const createResult = await createTaskWith({ ...VALID_FIELDS, sublist_id: 'sublist-2' });

        expect(createResult).toEqual({ data: null, error: 'Sublist does not belong to this list' });
    });

    it('rejects a subtask that would sit past the maximum depth', async () => {
        const createResult = await createTaskWith({ ...VALID_FIELDS, parent_id: 'task-3' });

        expect(createResult).toEqual({ data: null, error: 'Maximum nesting depth reached' });
    });
});

describe('createTask writes', () => {
    beforeEach(() => {
        currentUserId = OWNER_ID;
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => vi.restoreAllMocks());

    it('stores a cleaned title, the next position, depth 0 and the caller as creator', async () => {
        const createResult = await createTaskWith({ ...VALID_FIELDS, title: '  <b>Buy</b> milk ' });

        expect(createResult.error).toBeNull();
        expect(fake.inserts[0].values).toEqual({
            title: 'Buy milk',
            description: null,
            status_id: null,
            parent_id: null,
            sublist_id: null,
            list_id: 'list-1',
            position: 2,
            depth: 0,
            due_date: null,
            is_prioritised: false,
            is_recurring: false,
            recurrence_rule: null,
            next_occurrence: null,
            created_by: OWNER_ID,
        });
    });

    it('puts a subtask one level below its parent and drops any sublist', async () => {
        await createTaskWith({ ...VALID_FIELDS, parent_id: 'task-1' });

        expect(fake.inserts[0].values).toMatchObject({
            parent_id: 'task-1',
            depth: 1,
            sublist_id: null,
        });
    });

    it('keeps an explicit position and a root task sublist', async () => {
        await createTaskWith({ ...VALID_FIELDS, position: 7.5, sublist_id: 'sublist-1' });

        expect(fake.inserts[0].values).toMatchObject({ position: 7.5, sublist_id: 'sublist-1' });
    });

    it('never writes a field that is not on the allowlist', async () => {
        await createTaskWith({ ...VALID_FIELDS, created_by: 'someone-else', id_admin: true });

        expect(fake.inserts[0].values.created_by).toBe(OWNER_ID);
        expect(fake.inserts[0].values).not.toHaveProperty('id_admin');
    });

    it('sets the next occurrence for a recurring task', async () => {
        await createTaskWith({
            ...VALID_FIELDS,
            is_recurring: true,
            recurrence_rule: { freq: 'DAILY', interval: 1 },
        });

        expect(fake.inserts[0].values.is_recurring).toBe(true);
        expect(typeof fake.inserts[0].values.next_occurrence).toBe('string');
    });

    it('turns a database failure into a generic message without the detail', async () => {
        const createResult = await createTaskWith(VALID_FIELDS, {
            fakeOptions: { insertError: { code: 'XX000', message: 'secret table detail' } },
        });

        expect(createResult).toEqual({ data: null, error: 'Failed to create task' });
        expect(JSON.stringify(createResult)).not.toContain('secret');
    });

    it('turns the database write limit into its stable code', async () => {
        const createResult = await createTaskWith(VALID_FIELDS, {
            fakeOptions: {
                insertError: { code: 'P0001', message: 'TASK_WRITE_RATE_LIMITED:minute' },
            },
        });

        expect(createResult).toMatchObject({ data: null, code: 'TASK_RATE_LIMITED' });
    });
});
