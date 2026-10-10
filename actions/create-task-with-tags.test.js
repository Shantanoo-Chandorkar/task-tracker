import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from './test-support/fake-supabase';
import { buildTaskTables, COLLABORATOR_ID, OWNER_ID } from './test-support/task-fixtures';

const CLIENT_ID = '3f2b1c4e-5d6a-4b7c-8d9e-0a1b2c3d4e5f';
const tagId = (number) => `50000000-0000-4000-8000-${String(number).padStart(12, '0')}`;

let fake;
let tables;
let currentUserId;
const getCurrentUser = vi.fn(async () => currentUserId && { id: currentUserId });

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fake.client }));
vi.mock('@/lib/auth/session', () => ({ getCurrentUser: (...args) => getCurrentUser(...args) }));

function setUpWorld({ collaboratorLevel = null } = {}) {
    tables = buildTaskTables({ collaboratorLevel });
    tables.tags = [
        ...Array.from({ length: 12 }, (_, index) => ({
            id: tagId(index + 1),
            space_id: 'space-1',
            created_by: OWNER_ID,
        })),
        { id: tagId(99), space_id: 'space-2', created_by: OWNER_ID },
    ];
    tables.task_tags = [];
    fake = createFakeSupabase({ tables, getCallerId: () => currentUserId });
}

async function createWithTags(tagIds, fields = {}) {
    const { createTaskWithTags } = await import('./task-create-actions');
    return createTaskWithTags({ title: 'Buy milk', list_id: 'list-1', tagIds, ...fields });
}

const idsOfTags = (count) => Array.from({ length: count }, (_, index) => tagId(index + 1));
const attachedTagIds = () => tables.task_tags.map((row) => row.tag_id);

beforeEach(() => {
    currentUserId = OWNER_ID;
    setUpWorld();
    getCurrentUser.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('createTaskWithTags', () => {
    it('saves the task and attaches every chosen tag', async () => {
        const createResult = await createWithTags(idsOfTags(3));

        expect(createResult).toMatchObject({ error: null, tagErrors: [] });
        expect(createResult.data.title).toBe('Buy milk');
        expect(attachedTagIds()).toEqual(idsOfTags(3));
        expect(tables.task_tags.every((row) => row.task_id === createResult.data.id)).toBe(true);
    });

    it('signs in once and does the same work for 1 tag or 10', async () => {
        await createWithTags(idsOfTags(1));
        const oneTag = {
            signIns: getCurrentUser.mock.calls.length,
            queries: fake.queries.length,
            tagWrites: fake.inserts.filter((insert) => insert.tableName === 'task_tags').length,
        };

        getCurrentUser.mockClear();
        setUpWorld();
        await createWithTags(idsOfTags(10));
        const tenTags = {
            signIns: getCurrentUser.mock.calls.length,
            queries: fake.queries.length,
            tagWrites: fake.inserts.filter((insert) => insert.tableName === 'task_tags').length,
        };

        expect(oneTag.signIns).toBe(1);
        expect(tenTags).toEqual(oneTag);
        expect(tenTags.tagWrites).toBe(1);
    });

    it('does no tag work when no tags are chosen', async () => {
        for (const tagIds of [undefined, []]) {
            setUpWorld();

            expect(await createWithTags(tagIds)).toMatchObject({ error: null, tagErrors: [] });
            expect(fake.queries.some((query) => query.tableName === 'task_tags')).toBe(false);
        }
    });

    it('does not report tags that are already on the task when a lost reply is retried', async () => {
        tables.tasks.push({
            id: CLIENT_ID,
            list_id: 'list-1',
            created_by: OWNER_ID,
            title: 'Buy milk',
            parent_id: null,
            depth: 0,
            position: 5,
        });
        tables.task_tags.push({ task_id: CLIENT_ID, tag_id: tagId(1) });

        const createResult = await createWithTags(idsOfTags(2), { id: CLIENT_ID });

        expect(createResult).toMatchObject({ error: null, tagErrors: [], data: { id: CLIENT_ID } });
        expect(attachedTagIds()).toEqual(idsOfTags(2));
    });

    it('keeps the task and reports it when more than 10 tags are chosen', async () => {
        const createResult = await createWithTags(idsOfTags(11));

        expect(createResult.error).toBeNull();
        expect(createResult.data.id).toBeTruthy();
        expect(createResult.tagErrors).toEqual(['A task can have at most 10 tags']);
        expect(tables.task_tags).toEqual([]);
    });

    it('keeps the task and reports a tag that belongs to another space', async () => {
        const createResult = await createWithTags([tagId(1), tagId(99)]);

        expect(createResult.error).toBeNull();
        expect(createResult.tagErrors).toEqual(['Tag not found']);
        expect(tables.task_tags).toEqual([]);
    });

    it('keeps the task and says so when reading the tags fails', async () => {
        const realClient = fake.client;
        fake.client = {
            ...realClient,
            from: (tableName) =>
                tableName === 'task_tags'
                    ? {
                          select: () => ({
                              eq: async () => ({
                                  data: null,
                                  error: { code: 'XX000', message: 'relation exploded' },
                              }),
                          }),
                      }
                    : realClient.from(tableName),
        };

        const createResult = await createWithTags(idsOfTags(1));

        expect(createResult.error).toBeNull();
        expect(createResult.data.id).toBeTruthy();
        expect(createResult.tagErrors).toEqual(['Could not add the tags']);
    });

    it('does no tag work when the task itself is refused', async () => {
        const createResult = await createWithTags(idsOfTags(2), { title: '   ' });

        expect(createResult).toMatchObject({
            data: null,
            error: 'Title is required',
            tagErrors: [],
        });
        expect(fake.queries.some((query) => query.tableName === 'tags')).toBe(false);
    });

    it('lets a restricted collaborator tag the task they just made', async () => {
        setUpWorld({ collaboratorLevel: 'restricted' });
        currentUserId = COLLABORATOR_ID;

        const createResult = await createWithTags(idsOfTags(2));

        expect(createResult).toMatchObject({ error: null, tagErrors: [] });
        expect(attachedTagIds()).toEqual(idsOfTags(2));
    });

    it('refuses a signed-out caller with the stable auth code', async () => {
        currentUserId = null;

        expect(await createWithTags(idsOfTags(1))).toMatchObject({
            data: null,
            code: 'NOT_AUTHENTICATED',
        });
        expect(fake.inserts).toHaveLength(0);
    });
});
