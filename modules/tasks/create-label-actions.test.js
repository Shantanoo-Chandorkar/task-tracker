import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const OWNER_ID = 'user-owner';
const COLLABORATOR_ID = 'user-collab';
const SPACE_ID = 'space-1';

let fake;
let tables;
let currentUserId;

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fake.client }));
vi.mock('@/lib/auth/session', () => ({
    getCurrentUser: async () => currentUserId && { id: currentUserId },
}));

import { createFakeSupabase } from './actions/test-support/fake-supabase';
import { createLabelActions } from './create-label-actions';

function setUpWorld({ collaboratorLevel = null, tags = [], fakeOptions } = {}) {
    tables = {
        spaces: [{ id: SPACE_ID, owner_id: OWNER_ID }],
        space_collaborators: collaboratorLevel
            ? [
                  {
                      space_id: SPACE_ID,
                      user_id: COLLABORATOR_ID,
                      status: 'accepted',
                      permission_level: collaboratorLevel,
                  },
              ]
            : [],
        tags,
    };
    fake = createFakeSupabase({ tables, getCallerId: () => currentUserId, ...fakeOptions });
}

function buildActions(overrides = {}) {
    return createLabelActions({ table: 'tags', noun: 'Tag', logName: 'tags', ...overrides });
}

beforeEach(() => {
    currentUserId = OWNER_ID;
    setUpWorld();
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
});

describe('createLabelActions: create', () => {
    it('creates a label at the end of the space order, owned by the caller', async () => {
        setUpWorld({
            tags: [{ id: 'existing', space_id: SPACE_ID, position: 0, created_by: OWNER_ID }],
        });
        const { create } = buildActions();

        const result = await create({ name: 'Urgent', space_id: SPACE_ID });

        expect(result.error).toBeNull();
        expect(result.data).toMatchObject({
            name: 'Urgent',
            space_id: SPACE_ID,
            created_by: OWNER_ID,
            position: 1,
        });
    });

    it('defaults the color when none is sent', async () => {
        const { create } = buildActions();

        const result = await create({ name: 'Urgent', space_id: SPACE_ID });

        expect(result.data.color).toBe('#6b7280');
    });

    it('is idempotent: a retry with the same client id returns the first row, without a second insert', async () => {
        const { create } = buildActions();
        const clientId = '11111111-1111-4111-8111-111111111111';

        const first = await create({ id: clientId, name: 'Urgent', space_id: SPACE_ID });
        const second = await create({ id: clientId, name: 'Urgent', space_id: SPACE_ID });

        expect(second.data).toEqual(first.data);
        expect(tables.tags).toHaveLength(1);
    });

    it('refuses a client id that is not a real uuid', async () => {
        const { create } = buildActions();

        const result = await create({ id: 'not-a-uuid', name: 'Urgent', space_id: SPACE_ID });

        expect(result.code).toBe('INVALID_REQUEST_ID');
    });

    it('refuses a missing name', async () => {
        const { create } = buildActions();

        const result = await create({ name: '', space_id: SPACE_ID });

        expect(result.error).toBe('Tag name is required');
    });

    it('refuses a name past the length limit', async () => {
        const { create } = buildActions();

        const result = await create({ name: 'x'.repeat(100), space_id: SPACE_ID });

        expect(result.error).toMatch(/Tag name/);
    });

    it('refuses an invalid color before checking space membership', async () => {
        currentUserId = 'user-stranger';
        const { create } = buildActions();

        const result = await create({ name: 'Urgent', space_id: SPACE_ID, color: 'red' });

        expect(result.code).toBe('LABEL_COLOR_INVALID');
    });

    it('refuses a missing space id', async () => {
        const { create } = buildActions();

        const result = await create({ name: 'Urgent' });

        expect(result.error).toBe('A space is required');
    });

    it('refuses a caller with no access to the space', async () => {
        currentUserId = 'user-stranger';
        const { create } = buildActions();

        const result = await create({ name: 'Urgent', space_id: SPACE_ID });

        expect(result.code).toBe('PERMISSION_NOT_A_MEMBER');
    });

    it('refuses a read-only collaborator', async () => {
        setUpWorld({ collaboratorLevel: 'read_only' });
        currentUserId = COLLABORATOR_ID;
        const { create } = buildActions();

        const result = await create({ name: 'Urgent', space_id: SPACE_ID });

        expect(result.code).toBe('PERMISSION_READ_ONLY');
    });

    it('maps a name clash to the configured nameTakenFailure instead of a generic error', async () => {
        setUpWorld({ fakeOptions: { insertError: { code: '23505', message: 'duplicate key' } } });
        const { create } = buildActions({
            nameTakenFailure: { error: 'That name is already used', code: 'TAG_NAME_TAKEN' },
        });

        const result = await create({ name: 'Urgent', space_id: SPACE_ID });

        expect(result).toEqual({
            data: null,
            error: 'That name is already used',
            code: 'TAG_NAME_TAKEN',
        });
    });

    it('falls back to a generic failure on a name clash when nameTakenFailure is not configured', async () => {
        setUpWorld({ fakeOptions: { insertError: { code: '23505', message: 'duplicate key' } } });
        const { create } = buildActions();

        const result = await create({ name: 'Urgent', space_id: SPACE_ID });

        expect(result.error).toBe('Failed to create tag');
    });

    it('turns a guest-limit database error into the friendly guest message', async () => {
        setUpWorld({
            fakeOptions: { insertError: { message: 'GUEST_LIMIT_REACHED:tags something' } },
        });
        const { create } = buildActions();

        const result = await create({ name: 'Urgent', space_id: SPACE_ID });

        expect(result.code).toBe('GUEST_LIMIT_REACHED');
    });
});

describe('createLabelActions: update', () => {
    it('updates only the name, color and position - never any other field', async () => {
        setUpWorld({
            tags: [
                {
                    id: 'tag-1',
                    space_id: SPACE_ID,
                    created_by: OWNER_ID,
                    name: 'Old',
                    color: '#000000',
                    position: 0,
                },
            ],
        });
        const { update } = buildActions();

        const result = await update('tag-1', {
            name: 'New',
            color: '#111111',
            position: 2,
            space_id: 'space-elsewhere',
        });

        expect(result.error).toBeNull();
        expect(result.data).toMatchObject({
            name: 'New',
            color: '#111111',
            position: 2,
            space_id: SPACE_ID,
        });
    });

    it('refuses a missing id without reading the database', async () => {
        const { update } = buildActions();

        const result = await update('', { name: 'New' });

        expect(result.error).toBe('Tag ID is required');
    });

    it('reports not found for an id that does not exist', async () => {
        const { update } = buildActions();

        const result = await update('missing', { name: 'New' });

        expect(result.error).toBe('Tag not found');
    });

    it('validates a new name before loading the row for a permission check', async () => {
        setUpWorld({
            tags: [{ id: 'tag-1', space_id: SPACE_ID, created_by: OWNER_ID, name: 'Old' }],
        });
        const { update } = buildActions();

        const result = await update('tag-1', { name: '' });

        expect(result.error).toBe('Tag name is required');
    });

    it('validates a new color', async () => {
        setUpWorld({ tags: [{ id: 'tag-1', space_id: SPACE_ID, created_by: OWNER_ID }] });
        const { update } = buildActions();

        const result = await update('tag-1', { color: 'not-a-color' });

        expect(result.code).toBe('LABEL_COLOR_INVALID');
    });

    it('refuses a restricted collaborator editing a label they did not create', async () => {
        setUpWorld({
            collaboratorLevel: 'restricted',
            tags: [{ id: 'tag-1', space_id: SPACE_ID, created_by: OWNER_ID }],
        });
        currentUserId = COLLABORATOR_ID;
        const { update } = buildActions();

        const result = await update('tag-1', { name: 'New' });

        expect(result.code).toBe('PERMISSION_RESTRICTED_NOT_OWN');
    });

    it('maps a name clash on update to the configured nameTakenFailure', async () => {
        setUpWorld({
            tags: [{ id: 'tag-1', space_id: SPACE_ID, created_by: OWNER_ID }],
            fakeOptions: { updateError: { code: '23505', message: 'duplicate key' } },
        });
        const { update } = buildActions({
            nameTakenFailure: { error: 'That name is already used', code: 'TAG_NAME_TAKEN' },
        });

        const result = await update('tag-1', { name: 'Clash' });

        expect(result).toEqual({
            data: null,
            error: 'That name is already used',
            code: 'TAG_NAME_TAKEN',
        });
    });
});

describe('createLabelActions: remove', () => {
    it('deletes the label when there is no guard, or the guard allows it', async () => {
        setUpWorld({ tags: [{ id: 'tag-1', space_id: SPACE_ID, created_by: OWNER_ID }] });
        const { remove } = buildActions();

        const result = await remove('tag-1');

        expect(result).toEqual({ error: null });
        expect(tables.tags).toHaveLength(0);
    });

    it('refuses a missing id', async () => {
        const { remove } = buildActions();

        expect(await remove('')).toEqual({ error: 'Tag ID is required', code: undefined });
    });

    it('reports not found for an id that does not exist', async () => {
        const { remove } = buildActions();

        expect(await remove('missing')).toEqual({ error: 'Tag not found', code: undefined });
    });

    it('respects a guardDelete refusal and never deletes the row', async () => {
        setUpWorld({ tags: [{ id: 'tag-1', space_id: SPACE_ID, created_by: OWNER_ID }] });
        const guardDelete = vi.fn().mockResolvedValue({ error: 'Cannot delete the last tag' });
        const { remove } = buildActions({ guardDelete });

        const result = await remove('tag-1');

        expect(result).toEqual({ error: 'Cannot delete the last tag' });
        expect(tables.tags).toHaveLength(1);
    });

    it('passes the loaded label (with any extra deleteColumns) to guardDelete', async () => {
        setUpWorld({
            tags: [{ id: 'tag-1', space_id: SPACE_ID, created_by: OWNER_ID, is_default: true }],
        });
        const guardDelete = vi.fn().mockResolvedValue(null);
        const { remove } = buildActions({ guardDelete, deleteColumns: 'is_default' });

        await remove('tag-1');

        expect(guardDelete).toHaveBeenCalledWith(
            fake.client,
            expect.objectContaining({ is_default: true }),
        );
    });

    it('refuses a restricted collaborator deleting a label they did not create', async () => {
        setUpWorld({
            collaboratorLevel: 'restricted',
            tags: [{ id: 'tag-1', space_id: SPACE_ID, created_by: OWNER_ID }],
        });
        currentUserId = COLLABORATOR_ID;
        const { remove } = buildActions();

        const result = await remove('tag-1');

        expect(result.code).toBe('PERMISSION_RESTRICTED_NOT_OWN');
    });

    it('applies the configured codes to the id-required and not-found failures', async () => {
        const { remove } = buildActions({
            codes: { idRequired: 'TAG_ID_REQUIRED', notFound: 'TAG_NOT_FOUND' },
        });

        expect(await remove('')).toEqual({ error: 'Tag ID is required', code: 'TAG_ID_REQUIRED' });
        expect(await remove('missing')).toEqual({ error: 'Tag not found', code: 'TAG_NOT_FOUND' });
    });
});
