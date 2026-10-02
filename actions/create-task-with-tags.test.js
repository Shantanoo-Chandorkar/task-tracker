import { beforeEach, describe, expect, it, vi } from 'vitest';

const CLIENT_ID = '3f2b1c4e-5d6a-4b7c-8d9e-0a1b2c3d4e5f';
const addTagToTask = vi.fn();

// The task already exists, as it does when a lost-response create is retried with the same id
vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({
        from: () => ({
            select: () => ({
                eq: () => ({
                    maybeSingle: async () => ({
                        data: { id: CLIENT_ID, created_by: 'user-1', title: 'Buy milk' },
                    }),
                }),
            }),
        }),
    }),
}));
vi.mock('@/lib/auth/session', () => ({ getCurrentUser: async () => ({ id: 'user-1' }) }));
vi.mock('@/actions/tag-actions', () => ({ addTagToTask: (...args) => addTagToTask(...args) }));

describe('createTaskWithTags on a retried create', () => {
    beforeEach(() => vi.clearAllMocks());

    it('does not report a tag that is already on the task as a failure', async () => {
        addTagToTask.mockResolvedValue({
            data: null,
            error: 'Tag is already assigned to the task',
            code: 'TAG_ALREADY_ON_TASK',
        });
        const { createTaskWithTags } = await import('./task-actions');

        const { data, tagErrors } = await createTaskWithTags({
            id: CLIENT_ID,
            title: 'Buy milk',
            list_id: 'list-1',
            tagNames: ['urgent'],
        });

        expect(data.id).toBe(CLIENT_ID);
        expect(tagErrors).toEqual([]);
    });

    it('still reports a tag that genuinely failed', async () => {
        addTagToTask.mockResolvedValue({ data: null, error: 'Failed to create tag' });
        const { createTaskWithTags } = await import('./task-actions');

        const { tagErrors } = await createTaskWithTags({
            id: CLIENT_ID,
            title: 'Buy milk',
            list_id: 'list-1',
            tagNames: ['urgent'],
        });

        expect(tagErrors).toEqual(['urgent: Failed to create tag']);
    });
});
