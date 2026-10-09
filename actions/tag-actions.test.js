import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from './test-support/fake-supabase';
import { buildTaskTables, COLLABORATOR_ID, OWNER_ID } from './test-support/task-fixtures';

let fake;
let tables;
let currentUserId;

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fake.client }));
vi.mock('@/lib/auth/session', () => ({
    getCurrentUser: async () => currentUserId && { id: currentUserId },
}));

function buildTagRow(id, overrides = {}) {
    return {
        id,
        space_id: 'space-1',
        name: `Name of ${id}`,
        created_by: OWNER_ID,
        ...overrides,
    };
}

function setUpWorld({ collaboratorLevel = null, tags, taskTags, fakeOptions } = {}) {
    tables = buildTaskTables({ collaboratorLevel });
    tables.tags = tags ?? [buildTagRow('tag-1'), buildTagRow('tag-2')];
    tables.task_tags = taskTags ?? [{ task_id: 'task-1', tag_id: 'tag-1' }];
    fake = createFakeSupabase({ tables, getCallerId: () => currentUserId, ...fakeOptions });
}

async function tagActions() {
    return import('./tag-actions');
}

const taskTagIds = (taskId) =>
    tables.task_tags.filter((row) => row.task_id === taskId).map((row) => row.tag_id);

beforeEach(() => {
    currentUserId = OWNER_ID;
    setUpWorld();
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('removeTagFromTask', () => {
    it('refuses a signed-out caller with the stable auth code', async () => {
        currentUserId = null;
        const { removeTagFromTask } = await tagActions();

        expect(await removeTagFromTask({ taskId: 'task-1', tagId: 'tag-1' })).toMatchObject({
            code: 'NOT_AUTHENTICATED',
        });
    });

    it('needs both a task and a tag', async () => {
        const { removeTagFromTask } = await tagActions();

        expect(await removeTagFromTask({ taskId: 'task-1' })).toEqual({
            error: 'A task and tag are required',
        });
        expect(await removeTagFromTask({ tagId: 'tag-1' })).toEqual({
            error: 'A task and tag are required',
        });
    });

    it('says the task was not found for an unknown task', async () => {
        const { removeTagFromTask } = await tagActions();

        expect(await removeTagFromTask({ taskId: 'task-missing', tagId: 'tag-1' })).toEqual({
            error: 'Task not found',
        });
    });

    it('detaches the tag from that task only, and keeps the tag in the space', async () => {
        tables.task_tags.push({ task_id: 'task-2', tag_id: 'tag-1' });
        const { removeTagFromTask } = await tagActions();

        expect(await removeTagFromTask({ taskId: 'task-1', tagId: 'tag-1' })).toEqual({
            error: null,
        });
        expect(taskTagIds('task-1')).toEqual([]);
        expect(taskTagIds('task-2')).toEqual(['tag-1']);
        expect(tables.tags.map((tag) => tag.id)).toEqual(['tag-1', 'tag-2']);
    });

    it('lets a restricted collaborator untag only tasks they made', async () => {
        setUpWorld({ collaboratorLevel: 'restricted' });
        tables.tasks.find((task) => task.id === 'task-2').created_by = COLLABORATOR_ID;
        tables.task_tags.push({ task_id: 'task-2', tag_id: 'tag-1' });
        currentUserId = COLLABORATOR_ID;
        const { removeTagFromTask } = await tagActions();

        expect(await removeTagFromTask({ taskId: 'task-1', tagId: 'tag-1' })).toMatchObject({
            code: 'PERMISSION_RESTRICTED_NOT_OWN',
        });
        expect(await removeTagFromTask({ taskId: 'task-2', tagId: 'tag-1' })).toEqual({
            error: null,
        });
        expect(taskTagIds('task-1')).toEqual(['tag-1']);
    });

    it('refuses a read-only collaborator and a stranger', async () => {
        setUpWorld({ collaboratorLevel: 'read_only' });
        currentUserId = COLLABORATOR_ID;
        const { removeTagFromTask } = await tagActions();
        expect(await removeTagFromTask({ taskId: 'task-1', tagId: 'tag-1' })).toMatchObject({
            code: 'PERMISSION_READ_ONLY',
        });

        currentUserId = 'user-stranger';
        expect(await removeTagFromTask({ taskId: 'task-1', tagId: 'tag-1' })).toMatchObject({
            code: 'PERMISSION_NOT_A_MEMBER',
        });
        expect(taskTagIds('task-1')).toEqual(['tag-1']);
    });

    it('hides a database failure behind a fixed message', async () => {
        setUpWorld({ fakeOptions: { deleteError: { code: 'XX000', message: 'boom' } } });
        const { removeTagFromTask } = await tagActions();

        expect(await removeTagFromTask({ taskId: 'task-1', tagId: 'tag-1' })).toEqual({
            error: 'Failed to remove tag',
        });
    });
});

describe('deleteTag', () => {
    it('refuses a signed-out caller with the stable auth code', async () => {
        currentUserId = null;
        const { deleteTag } = await tagActions();

        expect(await deleteTag('tag-1')).toMatchObject({ code: 'NOT_AUTHENTICATED' });
    });

    it('needs a tag id', async () => {
        const { deleteTag } = await tagActions();

        expect(await deleteTag('')).toEqual({
            error: 'Tag ID is required',
            code: 'TAG_ID_REQUIRED',
        });
    });

    it('says the tag was not found for an unknown id', async () => {
        const { deleteTag } = await tagActions();

        expect(await deleteTag('tag-missing')).toEqual({
            error: 'Tag not found',
            code: 'TAG_NOT_FOUND',
        });
    });

    it('deletes the tag', async () => {
        const { deleteTag } = await tagActions();

        expect(await deleteTag('tag-2')).toEqual({ error: null });
        expect(tables.tags.map((tag) => tag.id)).toEqual(['tag-1']);
    });

    it('lets a restricted collaborator delete only the tags they made', async () => {
        setUpWorld({
            collaboratorLevel: 'restricted',
            tags: [
                buildTagRow('tag-mine', { created_by: COLLABORATOR_ID }),
                buildTagRow('tag-theirs'),
            ],
        });
        currentUserId = COLLABORATOR_ID;
        const { deleteTag } = await tagActions();

        expect(await deleteTag('tag-theirs')).toMatchObject({
            code: 'PERMISSION_RESTRICTED_NOT_OWN',
        });
        expect(await deleteTag('tag-mine')).toEqual({ error: null });
        expect(tables.tags.map((tag) => tag.id)).toEqual(['tag-theirs']);
    });

    it('refuses a read-only collaborator and a stranger', async () => {
        setUpWorld({ collaboratorLevel: 'read_only' });
        currentUserId = COLLABORATOR_ID;
        const { deleteTag } = await tagActions();
        expect(await deleteTag('tag-1')).toMatchObject({ code: 'PERMISSION_READ_ONLY' });

        currentUserId = 'user-stranger';
        expect(await deleteTag('tag-1')).toMatchObject({ code: 'PERMISSION_NOT_A_MEMBER' });
        expect(tables.tags).toHaveLength(2);
    });

    it('says not found when the delete removed nothing', async () => {
        setUpWorld({ fakeOptions: { deleteError: { code: 'XX000', message: 'boom' } } });
        const { deleteTag } = await tagActions();

        expect(await deleteTag('tag-1')).toEqual({ error: 'Tag not found', code: 'TAG_NOT_FOUND' });
    });
});

describe('deleteAllTagsInSpace', () => {
    it('needs a space id', async () => {
        const { deleteAllTagsInSpace } = await tagActions();

        expect(await deleteAllTagsInSpace('')).toEqual({
            count: 0,
            error: 'Space ID is required',
            code: 'TAG_SPACE_ID_REQUIRED',
        });
    });

    it('deletes every tag of that space only and says how many', async () => {
        setUpWorld({
            tags: [
                buildTagRow('tag-1'),
                buildTagRow('tag-2'),
                buildTagRow('tag-3', { space_id: 'space-2' }),
            ],
        });
        const { deleteAllTagsInSpace } = await tagActions();

        expect(await deleteAllTagsInSpace('space-1')).toEqual({
            count: 2,
            error: null,
            code: null,
        });
        expect(tables.tags.map((tag) => tag.id)).toEqual(['tag-3']);
    });

    it('checks the space permission once, as for creating a row', async () => {
        setUpWorld({ collaboratorLevel: 'read_only' });
        currentUserId = COLLABORATOR_ID;
        const { deleteAllTagsInSpace } = await tagActions();
        expect(await deleteAllTagsInSpace('space-1')).toMatchObject({
            count: 0,
            code: 'PERMISSION_READ_ONLY',
        });

        currentUserId = 'user-stranger';
        expect(await deleteAllTagsInSpace('space-1')).toMatchObject({
            count: 0,
            code: 'PERMISSION_NOT_A_MEMBER',
        });
        expect(tables.tags).toHaveLength(2);
    });

    it('hides a database failure behind a fixed message and code', async () => {
        setUpWorld({ fakeOptions: { deleteError: { code: 'XX000', message: 'boom' } } });
        const { deleteAllTagsInSpace } = await tagActions();

        expect(await deleteAllTagsInSpace('space-1')).toEqual({
            count: 0,
            error: 'Failed to delete tags',
            code: 'TAG_DELETE_FAILED',
        });
    });
});

describe('createTag', () => {
    const CLIENT_ID = '3f2b1c4e-5d6a-4b7c-8d9e-0a1b2c3d4e5f';

    it('stores a trimmed name after the last tag of the space, with the default colour and the caller as creator', async () => {
        tables.tags[0].position = 4;
        tables.tags[1].position = 7;
        tables.tags.push(buildTagRow('tag-other', { space_id: 'space-2', position: 99 }));
        const { createTag } = await tagActions();

        const createResult = await createTag({ name: '  Urgent ', space_id: 'space-1' });

        expect(createResult.error).toBeNull();
        expect(createResult.data).toMatchObject({
            name: 'Urgent',
            color: '#6b7280',
            position: 8,
            space_id: 'space-1',
            created_by: OWNER_ID,
        });
    });

    it('keeps a valid colour and refuses an invalid one without writing', async () => {
        const { createTag } = await tagActions();

        expect(
            (await createTag({ name: 'Red', space_id: 'space-1', color: '#ff0000' })).data.color,
        ).toBe('#ff0000');
        expect(await createTag({ name: 'Bad', space_id: 'space-1', color: 'red' })).toMatchObject({
            data: null,
            code: 'LABEL_COLOR_INVALID',
        });
        expect(fake.inserts).toHaveLength(1);
    });

    it.each([
        [{ name: '   ', space_id: 'space-1' }, 'Tag name is required'],
        [{ name: 'x'.repeat(51), space_id: 'space-1' }, 'Tag name cannot exceed 50 characters.'],
        [{ name: 'Urgent' }, 'A space is required'],
    ])('refuses %j with "%s"', async (fields, message) => {
        const { createTag } = await tagActions();

        expect(await createTag(fields)).toEqual({ data: null, error: message });
        expect(fake.inserts).toHaveLength(0);
    });

    it('writes only the allowed fields', async () => {
        const { createTag } = await tagActions();

        await createTag({ name: 'Urgent', space_id: 'space-1', created_by: 'someone-else' });

        const [{ values }] = fake.inserts;
        expect(Object.keys(values).sort()).toEqual([
            'color',
            'created_by',
            'name',
            'position',
            'space_id',
        ]);
        expect(values.created_by).toBe(OWNER_ID);
    });

    it('says the name is taken when the database reports a clash, with its own code', async () => {
        setUpWorld({
            fakeOptions: { insertErrorByTable: { tags: { code: '23505', message: 'duplicate' } } },
        });
        const { createTag } = await tagActions();

        expect(await createTag({ name: 'urgent', space_id: 'space-1' })).toEqual({
            data: null,
            error: 'A tag with that name already exists',
            code: 'TAG_NAME_TAKEN',
        });
    });

    it('returns the row of the first try for a repeated client id, without inserting again', async () => {
        tables.tags.push(buildTagRow(CLIENT_ID, { name: 'First try' }));
        const { createTag } = await tagActions();

        const createResult = await createTag({
            id: CLIENT_ID,
            name: 'Second',
            space_id: 'space-1',
        });

        expect(createResult).toMatchObject({
            error: null,
            data: { id: CLIENT_ID, name: 'First try' },
        });
        expect(fake.inserts).toHaveLength(0);
    });

    it('lets owner, full and restricted collaborators create, and refuses read-only and strangers', async () => {
        const { createTag } = await tagActions();

        for (const level of ['full', 'restricted']) {
            setUpWorld({ collaboratorLevel: level });
            currentUserId = COLLABORATOR_ID;
            const createResult = await createTag({ name: `By ${level}`, space_id: 'space-1' });
            expect(createResult.error).toBeNull();
            expect(createResult.data.created_by).toBe(COLLABORATOR_ID);
        }

        setUpWorld({ collaboratorLevel: 'read_only' });
        currentUserId = COLLABORATOR_ID;
        expect(await createTag({ name: 'No', space_id: 'space-1' })).toMatchObject({
            code: 'PERMISSION_READ_ONLY',
        });
        currentUserId = 'user-stranger';
        expect(await createTag({ name: 'No', space_id: 'space-1' })).toMatchObject({
            code: 'PERMISSION_NOT_A_MEMBER',
        });
        expect(fake.inserts).toHaveLength(0);
    });

    it('turns a guest limit error into the friendly guest result', async () => {
        setUpWorld({
            fakeOptions: {
                insertErrorByTable: {
                    tags: { code: 'P0001', message: 'GUEST_LIMIT_REACHED:tags' },
                },
            },
        });
        const { createTag } = await tagActions();

        const createResult = await createTag({ name: 'Urgent', space_id: 'space-1' });

        expect(createResult.error).toContain('Guest mode is limited to 20 tags');
    });
});

describe('updateTag', () => {
    it('saves the name, colour and position, and nothing else', async () => {
        const { updateTag } = await tagActions();

        const updateResult = await updateTag('tag-1', {
            name: ' Later ',
            color: '#00ff00',
            position: 5,
            space_id: 'space-2',
            created_by: COLLABORATOR_ID,
        });

        expect(updateResult.error).toBeNull();
        expect(fake.updates).toEqual([
            { tableName: 'tags', values: { name: 'Later', color: '#00ff00', position: 5 } },
        ]);
        expect(tables.tags[0]).toMatchObject({ space_id: 'space-1', created_by: OWNER_ID });
    });

    it('needs a tag id and says not found for an unknown one, with the tag codes', async () => {
        const { updateTag } = await tagActions();

        expect(await updateTag('', { name: 'New' })).toEqual({
            data: null,
            error: 'Tag ID is required',
            code: 'TAG_ID_REQUIRED',
        });
        expect(await updateTag('tag-missing', { name: 'New' })).toEqual({
            data: null,
            error: 'Tag not found',
            code: 'TAG_NOT_FOUND',
        });
    });

    it('refuses a bad name or colour without writing', async () => {
        const { updateTag } = await tagActions();

        expect(await updateTag('tag-1', { name: '  ' })).toEqual({
            data: null,
            error: 'Tag name is required',
        });
        expect(await updateTag('tag-1', { color: '#fff' })).toMatchObject({
            code: 'LABEL_COLOR_INVALID',
        });
        expect(fake.updates).toHaveLength(0);
    });

    it('says the name is taken when the database reports a clash', async () => {
        setUpWorld({ fakeOptions: { updateError: { code: '23505', message: 'duplicate' } } });
        const { updateTag } = await tagActions();

        expect(await updateTag('tag-1', { name: 'Name of tag-2' })).toMatchObject({
            data: null,
            code: 'TAG_NAME_TAKEN',
        });
    });

    it('lets a restricted collaborator edit only the tags they made, and refuses read-only', async () => {
        setUpWorld({
            collaboratorLevel: 'restricted',
            tags: [
                buildTagRow('tag-mine', { created_by: COLLABORATOR_ID }),
                buildTagRow('tag-theirs'),
            ],
        });
        currentUserId = COLLABORATOR_ID;
        const { updateTag } = await tagActions();

        expect((await updateTag('tag-mine', { name: 'Edited' })).error).toBeNull();
        expect(await updateTag('tag-theirs', { name: 'Edited' })).toMatchObject({
            code: 'PERMISSION_RESTRICTED_NOT_OWN',
        });

        setUpWorld({ collaboratorLevel: 'read_only' });
        currentUserId = COLLABORATOR_ID;
        expect(await updateTag('tag-1', { name: 'Edited' })).toMatchObject({
            code: 'PERMISSION_READ_ONLY',
        });
    });
});

describe('assignTagsToTask', () => {
    const TAG_A = '50000000-0000-4000-8000-00000000000a';
    const TAG_B = '50000000-0000-4000-8000-00000000000b';
    const TAG_OTHER_SPACE = '50000000-0000-4000-8000-00000000000c';

    function setUpTagWorld(options = {}) {
        setUpWorld({
            tags: [
                buildTagRow(TAG_A),
                buildTagRow(TAG_B),
                buildTagRow(TAG_OTHER_SPACE, { space_id: 'space-2' }),
            ],
            taskTags: [],
            ...options,
        });
    }

    beforeEach(() => setUpTagWorld());

    it('refuses a signed-out caller with the stable auth code', async () => {
        currentUserId = null;
        const { assignTagsToTask } = await tagActions();

        expect(await assignTagsToTask({ taskId: 'task-1', tagIds: [TAG_A] })).toMatchObject({
            code: 'NOT_AUTHENTICATED',
        });
    });

    it('attaches several tags of the task space to the task', async () => {
        const { assignTagsToTask } = await tagActions();

        expect(await assignTagsToTask({ taskId: 'task-1', tagIds: [TAG_A, TAG_B] })).toEqual({
            error: null,
        });
        expect(taskTagIds('task-1')).toEqual([TAG_A, TAG_B]);
    });

    it('never creates a tag: an unknown name or id is just not found', async () => {
        const { assignTagsToTask } = await tagActions();

        const missingTagId = '50000000-0000-4000-8000-0000000000ff';
        expect(await assignTagsToTask({ taskId: 'task-1', tagIds: [missingTagId] })).toMatchObject({
            code: 'TAG_NOT_FOUND',
        });
        expect(await assignTagsToTask({ taskId: 'task-1', tagIds: ['Urgent'] })).toMatchObject({
            code: 'TAG_NOT_FOUND',
        });
        expect(fake.inserts).toHaveLength(0);
        expect(tables.tags).toHaveLength(3);
    });

    it('refuses a tag from another space', async () => {
        const { assignTagsToTask } = await tagActions();

        expect(
            await assignTagsToTask({ taskId: 'task-1', tagIds: [TAG_A, TAG_OTHER_SPACE] }),
        ).toMatchObject({ code: 'TAG_NOT_FOUND' });
        expect(taskTagIds('task-1')).toEqual([]);
    });

    it.each([
        [{ tagIds: [TAG_A] }, 'A task is required'],
        [{ taskId: 'task-1' }, 'Choose at least one tag'],
        [{ taskId: 'task-1', tagIds: [] }, 'Choose at least one tag'],
        [{ taskId: 'task-missing', tagIds: [TAG_A] }, 'Task not found'],
    ])('refuses %j with "%s"', async (fields, message) => {
        const { assignTagsToTask } = await tagActions();

        expect(await assignTagsToTask(fields)).toMatchObject({ error: message });
        expect(fake.inserts).toHaveLength(0);
    });

    it('lets a restricted collaborator tag only tasks they made', async () => {
        setUpTagWorld({ collaboratorLevel: 'restricted' });
        tables.tasks.find((task) => task.id === 'task-2').created_by = COLLABORATOR_ID;
        currentUserId = COLLABORATOR_ID;
        const { assignTagsToTask } = await tagActions();

        expect(await assignTagsToTask({ taskId: 'task-1', tagIds: [TAG_A] })).toMatchObject({
            code: 'PERMISSION_RESTRICTED_NOT_OWN',
        });
        expect(await assignTagsToTask({ taskId: 'task-2', tagIds: [TAG_A] })).toEqual({
            error: null,
        });
    });

    it('lets a full collaborator tag any task, and refuses read-only and strangers', async () => {
        setUpTagWorld({ collaboratorLevel: 'full' });
        currentUserId = COLLABORATOR_ID;
        const { assignTagsToTask } = await tagActions();
        expect(await assignTagsToTask({ taskId: 'task-1', tagIds: [TAG_A] })).toEqual({
            error: null,
        });

        setUpTagWorld({ collaboratorLevel: 'read_only' });
        currentUserId = COLLABORATOR_ID;
        expect(await assignTagsToTask({ taskId: 'task-1', tagIds: [TAG_A] })).toMatchObject({
            code: 'PERMISSION_READ_ONLY',
        });
        currentUserId = 'user-stranger';
        expect(await assignTagsToTask({ taskId: 'task-1', tagIds: [TAG_A] })).toMatchObject({
            code: 'PERMISSION_NOT_A_MEMBER',
        });
        expect(taskTagIds('task-1')).toEqual([]);
    });

    it('does not report a tag that is already on the task as a failure', async () => {
        setUpTagWorld({ taskTags: [{ task_id: 'task-1', tag_id: TAG_A }] });
        const { assignTagsToTask } = await tagActions();

        expect(await assignTagsToTask({ taskId: 'task-1', tagIds: [TAG_A, TAG_B] })).toEqual({
            error: null,
        });
        expect(taskTagIds('task-1')).toEqual([TAG_A, TAG_B]);
    });
});
