import { describe, expect, it } from 'vitest';
import { createFakeSupabase } from '@/actions/test-support/fake-supabase';
import { attachTagsToTask } from './attach-tags-to-task';
import { MAX_TAGS_PER_TASK } from './tag-limits';

const TASK_ID = 'task-1';
const SPACE_ID = 'space-1';
const tagId = (number) => `50000000-0000-4000-8000-${String(number).padStart(12, '0')}`;

function setUp({ tags, attachedTagIds = [], fakeOptions } = {}) {
    const tables = {
        tags:
            tags ??
            Array.from({ length: 12 }, (_, index) => ({
                id: tagId(index + 1),
                space_id: SPACE_ID,
            })),
        task_tags: attachedTagIds.map((attachedTagId) => ({
            task_id: TASK_ID,
            tag_id: attachedTagId,
        })),
    };
    const fake = createFakeSupabase({ tables, ...fakeOptions });
    return { tables, fake };
}

const attach = (fake, tagIds) =>
    attachTagsToTask(fake.client, { taskId: TASK_ID, spaceId: SPACE_ID, tagIds });

const attachedIds = (tables) => tables.task_tags.map((row) => row.tag_id);

describe('attachTagsToTask', () => {
    it('attaches several tags with one write', async () => {
        const { tables, fake } = setUp();

        expect(await attach(fake, [tagId(1), tagId(2), tagId(3)])).toEqual({ error: null });

        expect(attachedIds(tables)).toEqual([tagId(1), tagId(2), tagId(3)]);
        expect(fake.inserts.filter((insert) => insert.tableName === 'task_tags')).toHaveLength(1);
    });

    it('uses the same number of reads and writes however many tags are attached', async () => {
        const one = setUp();
        const many = setUp();

        await attach(one.fake, [tagId(1)]);
        await attach(
            many.fake,
            Array.from({ length: MAX_TAGS_PER_TASK }, (_, index) => tagId(index + 1)),
        );

        expect(many.fake.queries).toHaveLength(one.fake.queries.length);
        expect(many.fake.inserts).toHaveLength(one.fake.inserts.length);
    });

    it('does nothing for an empty list', async () => {
        const { fake } = setUp();

        expect(await attach(fake, [])).toEqual({ error: null });
        expect(fake.queries).toHaveLength(0);
        expect(fake.inserts).toHaveLength(0);
    });

    it('counts a repeated id once', async () => {
        const { tables, fake } = setUp();

        expect(await attach(fake, [tagId(1), tagId(1)])).toEqual({ error: null });
        expect(attachedIds(tables)).toEqual([tagId(1)]);
    });

    it('leaves tags that are already on the task alone, so a retry succeeds', async () => {
        const { tables, fake } = setUp({ attachedTagIds: [tagId(1)] });

        expect(await attach(fake, [tagId(1), tagId(2)])).toEqual({ error: null });
        expect(attachedIds(tables)).toEqual([tagId(1), tagId(2)]);
    });

    it('allows a task to reach exactly the cap', async () => {
        const { tables, fake } = setUp({ attachedTagIds: [tagId(1), tagId(2)] });

        const eightMore = Array.from({ length: 8 }, (_, index) => tagId(index + 3));
        expect(await attach(fake, eightMore)).toEqual({ error: null });
        expect(tables.task_tags).toHaveLength(MAX_TAGS_PER_TASK);
    });

    it('counts the tags already on the task towards the cap, and attaches nothing when over', async () => {
        const { tables, fake } = setUp({ attachedTagIds: [tagId(1), tagId(2)] });

        const nineMore = Array.from({ length: 9 }, (_, index) => tagId(index + 3));
        expect(await attach(fake, nineMore)).toMatchObject({ code: 'TAG_LIMIT_REACHED' });
        expect(attachedIds(tables)).toEqual([tagId(1), tagId(2)]);
    });

    it('refuses more than the cap in one request without reading anything', async () => {
        const { fake } = setUp();

        const eleven = Array.from({ length: 11 }, (_, index) => tagId(index + 1));
        expect(await attach(fake, eleven)).toMatchObject({ code: 'TAG_LIMIT_REACHED' });
        expect(fake.queries).toHaveLength(0);
    });

    it.each([undefined, null, 'tag', [42], ['not-a-uuid'], [tagId(1), 'x']])(
        'refuses %j as not found without reading anything',
        async (tagIds) => {
            const { fake } = setUp();

            expect(await attach(fake, tagIds)).toEqual({
                error: 'Tag not found',
                code: 'TAG_NOT_FOUND',
            });
            expect(fake.queries).toHaveLength(0);
        },
    );

    it('refuses a tag of another space exactly like a missing one, and attaches nothing', async () => {
        const { tables, fake } = setUp({
            tags: [
                { id: tagId(1), space_id: SPACE_ID },
                { id: tagId(2), space_id: 'space-2' },
            ],
        });

        expect(await attach(fake, [tagId(1), tagId(2)])).toEqual({
            error: 'Tag not found',
            code: 'TAG_NOT_FOUND',
        });
        expect(await attach(fake, [tagId(3)])).toEqual({
            error: 'Tag not found',
            code: 'TAG_NOT_FOUND',
        });
        expect(tables.task_tags).toEqual([]);
    });

    it('hides a database failure behind a fixed message and code', async () => {
        const { fake } = setUp({
            fakeOptions: {
                insertErrorByTable: { task_tags: { code: 'XX000', message: 'relation exploded' } },
            },
        });

        expect(await attach(fake, [tagId(1)])).toEqual({
            error: 'Failed to tag task',
            code: 'TAG_ASSIGN_FAILED',
        });
    });
});
