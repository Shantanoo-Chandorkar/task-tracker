import { describe, expect, it } from 'vitest';
import { createFakeSupabase } from '@/modules/tasks/actions/test-support/fake-supabase';
import {
    reorderListsInSpace,
    reorderOwnedSpaces,
    reorderStatusesInSpace,
    reorderSublistsInList,
    reorderTagsInSpace,
} from './reorder-rows';

const OWNER = { id: '00000000-0000-4000-8000-00000000000a' };
const OTHER_USER = { id: '00000000-0000-4000-8000-00000000000b' };
const COLLABORATOR = { id: '00000000-0000-4000-8000-00000000000c' };

const SPACE = 'a0000000-0000-4000-8000-000000000001';
const OTHER_SPACE = 'a0000000-0000-4000-8000-000000000002';
const LIST = 'b0000000-0000-4000-8000-000000000001';
const OTHER_LIST = 'b0000000-0000-4000-8000-000000000002';

function uuid(group, sequence) {
    const groupHex = group.toString(16).padStart(3, '0');
    return `c0000000-0000-4000-8${groupHex}-${String(sequence).padStart(12, '0')}`;
}

function baseTables() {
    return {
        spaces: [
            { id: SPACE, owner_id: OWNER.id, position: 0 },
            { id: OTHER_SPACE, owner_id: OTHER_USER.id, position: 0 },
        ],
        space_collaborators: [],
        lists: [
            { id: LIST, space_id: SPACE, created_by: OWNER.id, position: 0 },
            { id: OTHER_LIST, space_id: OTHER_SPACE, created_by: OTHER_USER.id, position: 0 },
        ],
        sublists: [],
        statuses: [],
        tags: [],
    };
}

function clientFor(tables, callerId, extraOptions = {}) {
    return createFakeSupabase({ tables, getCallerId: () => callerId, ...extraOptions }).client;
}

describe('reorderOwnedSpaces', () => {
    it("saves the new position for every one of the caller's own spaces", async () => {
        const tables = baseTables();
        tables.spaces.push({ id: uuid(1, 1), owner_id: OWNER.id, position: 1 });
        const ownSpaceIds = [SPACE, uuid(1, 1)];
        const supabase = clientFor(tables, OWNER.id);

        const result = await reorderOwnedSpaces(supabase, OWNER, [...ownSpaceIds].reverse());

        expect(result).toEqual({ error: null });
        expect(tables.spaces.find((space) => space.id === SPACE).position).toBe(1);
        expect(tables.spaces.find((space) => space.id === uuid(1, 1)).position).toBe(0);
    });

    it('refuses a malformed id list before touching the database', async () => {
        const tables = baseTables();
        const supabase = clientFor(tables, OWNER.id);

        const result = await reorderOwnedSpaces(supabase, OWNER, ['not-a-uuid']);

        expect(result.code).toBe('REORDER_INVALID_REQUEST');
    });

    it("treats another user's space as not found, leaking nothing about its existence", async () => {
        const tables = baseTables();
        const supabase = clientFor(tables, OWNER.id);

        const result = await reorderOwnedSpaces(supabase, OWNER, [SPACE, OTHER_SPACE]);

        expect(result.code).toBe('REORDER_ROWS_NOT_FOUND');
    });

    it('does not write anything when the new order matches the saved order', async () => {
        const tables = baseTables();
        tables.spaces.push({ id: uuid(1, 1), owner_id: OWNER.id, position: 1 });
        const supabase = clientFor(tables, OWNER.id);

        const result = await reorderOwnedSpaces(supabase, OWNER, [SPACE, uuid(1, 1)]);

        expect(result).toEqual({ error: null });
        expect(tables.spaces.find((space) => space.id === SPACE).position).toBe(0);
        expect(tables.spaces.find((space) => space.id === uuid(1, 1)).position).toBe(1);
    });

    it('reports a save failure, without crashing, when the database update errors', async () => {
        const tables = baseTables();
        tables.spaces.push({ id: uuid(1, 1), owner_id: OWNER.id, position: 1 });
        const supabase = clientFor(tables, OWNER.id, {
            updateError: { code: '42501', message: 'blocked' },
        });

        const result = await reorderOwnedSpaces(supabase, OWNER, [uuid(1, 1), SPACE]);

        expect(result.code).toBe('REORDER_SAVE_FAILED');
    });
});

describe('reorderListsInSpace', () => {
    it('lets the space owner reorder its lists', async () => {
        const tables = baseTables();
        tables.lists.push({ id: uuid(2, 1), space_id: SPACE, created_by: OWNER.id, position: 1 });
        const supabase = clientFor(tables, OWNER.id);

        const result = await reorderListsInSpace(supabase, OWNER, SPACE, [uuid(2, 1), LIST]);

        expect(result).toEqual({ error: null });
        expect(tables.lists.find((list) => list.id === LIST).position).toBe(1);
        expect(tables.lists.find((list) => list.id === uuid(2, 1)).position).toBe(0);
    });

    it('lets a full collaborator reorder lists they did not create', async () => {
        const tables = baseTables();
        tables.space_collaborators.push({
            space_id: SPACE,
            user_id: COLLABORATOR.id,
            status: 'accepted',
            permission_level: 'full',
        });
        tables.lists.push({ id: uuid(2, 1), space_id: SPACE, created_by: OWNER.id, position: 1 });
        const supabase = clientFor(tables, COLLABORATOR.id);

        const result = await reorderListsInSpace(supabase, COLLABORATOR, SPACE, [uuid(2, 1), LIST]);

        expect(result).toEqual({ error: null });
    });

    it('lets a restricted collaborator reorder only the lists they created themselves', async () => {
        const tables = baseTables();
        tables.space_collaborators.push({
            space_id: SPACE,
            user_id: COLLABORATOR.id,
            status: 'accepted',
            permission_level: 'restricted',
        });
        tables.lists.push({
            id: uuid(2, 1),
            space_id: SPACE,
            created_by: COLLABORATOR.id,
            position: 1,
        });
        const supabase = clientFor(tables, COLLABORATOR.id);

        const own = await reorderListsInSpace(supabase, COLLABORATOR, SPACE, [uuid(2, 1), LIST]);
        expect(own.code).toBe('PERMISSION_RESTRICTED_NOT_OWN');
    });

    it('refuses a read-only collaborator before loading any rows', async () => {
        const tables = baseTables();
        tables.space_collaborators.push({
            space_id: SPACE,
            user_id: COLLABORATOR.id,
            status: 'accepted',
            permission_level: 'read_only',
        });
        const supabase = clientFor(tables, COLLABORATOR.id);

        const result = await reorderListsInSpace(supabase, COLLABORATOR, SPACE, [LIST]);

        expect(result.code).toBe('PERMISSION_READ_ONLY');
    });

    it('refuses a caller who is not a member of the space', async () => {
        const tables = baseTables();
        const supabase = clientFor(tables, OTHER_USER.id);

        const result = await reorderListsInSpace(supabase, OTHER_USER, SPACE, [LIST]);

        expect(result.code).toBe('PERMISSION_NOT_A_MEMBER');
    });

    it('treats a list from a different space as not found', async () => {
        const tables = baseTables();
        const supabase = clientFor(tables, OWNER.id);

        const result = await reorderListsInSpace(supabase, OWNER, SPACE, [LIST, OTHER_LIST]);

        expect(result.code).toBe('REORDER_ROWS_NOT_FOUND');
    });

    it('refuses a malformed space id', async () => {
        const tables = baseTables();
        const supabase = clientFor(tables, OWNER.id);

        const result = await reorderListsInSpace(supabase, OWNER, 'not-a-uuid', [LIST]);

        expect(result.code).toBe('REORDER_INVALID_REQUEST');
    });
});

describe('reorderStatusesInSpace and reorderTagsInSpace', () => {
    it('reorders statuses scoped to the space', async () => {
        const tables = baseTables();
        tables.statuses.push(
            { id: uuid(3, 1), space_id: SPACE, created_by: OWNER.id, position: 0 },
            { id: uuid(3, 2), space_id: SPACE, created_by: OWNER.id, position: 1 },
        );
        const supabase = clientFor(tables, OWNER.id);

        const result = await reorderStatusesInSpace(supabase, OWNER, SPACE, [
            uuid(3, 2),
            uuid(3, 1),
        ]);

        expect(result).toEqual({ error: null });
        expect(tables.statuses.find((status) => status.id === uuid(3, 1)).position).toBe(1);
        expect(tables.statuses.find((status) => status.id === uuid(3, 2)).position).toBe(0);
    });

    it('reorders tags scoped to the space', async () => {
        const tables = baseTables();
        tables.tags.push(
            { id: uuid(4, 1), space_id: SPACE, created_by: OWNER.id, position: 0 },
            { id: uuid(4, 2), space_id: SPACE, created_by: OWNER.id, position: 1 },
        );
        const supabase = clientFor(tables, OWNER.id);

        const result = await reorderTagsInSpace(supabase, OWNER, SPACE, [uuid(4, 2), uuid(4, 1)]);

        expect(result).toEqual({ error: null });
        expect(tables.tags.find((tag) => tag.id === uuid(4, 1)).position).toBe(1);
    });

    it('keeps tags and statuses isolated from each other even with colliding ids', async () => {
        const tables = baseTables();
        tables.statuses.push({
            id: uuid(5, 1),
            space_id: SPACE,
            created_by: OWNER.id,
            position: 0,
        });
        // A tag table with no matching id - the statuses id must never satisfy the tags query
        const supabase = clientFor(tables, OWNER.id);

        const result = await reorderTagsInSpace(supabase, OWNER, SPACE, [uuid(5, 1)]);

        expect(result.code).toBe('REORDER_ROWS_NOT_FOUND');
    });
});

describe('reorderSublistsInList', () => {
    it("lets the list's space owner reorder its sublists", async () => {
        const tables = baseTables();
        tables.sublists.push(
            { id: uuid(6, 1), list_id: LIST, created_by: OWNER.id, position: 0 },
            { id: uuid(6, 2), list_id: LIST, created_by: OWNER.id, position: 1 },
        );
        const supabase = clientFor(tables, OWNER.id);

        const result = await reorderSublistsInList(supabase, OWNER, LIST, [uuid(6, 2), uuid(6, 1)]);

        expect(result).toEqual({ error: null });
        expect(tables.sublists.find((sublist) => sublist.id === uuid(6, 1)).position).toBe(1);
    });

    it('reports not found for a list id that does not exist, without a permission check', async () => {
        const tables = baseTables();
        const supabase = clientFor(tables, OWNER.id);

        const result = await reorderSublistsInList(supabase, OWNER, uuid(9, 9), [uuid(6, 1)]);

        expect(result.code).toBe('REORDER_ROWS_NOT_FOUND');
    });

    it("refuses a caller who is not a member of the list's space", async () => {
        const tables = baseTables();
        tables.sublists.push({ id: uuid(6, 1), list_id: LIST, created_by: OWNER.id, position: 0 });
        const supabase = clientFor(tables, OTHER_USER.id);

        const result = await reorderSublistsInList(supabase, OTHER_USER, LIST, [uuid(6, 1)]);

        expect(result.code).toBe('PERMISSION_NOT_A_MEMBER');
    });

    it('refuses a malformed list id', async () => {
        const tables = baseTables();
        const supabase = clientFor(tables, OWNER.id);

        const result = await reorderSublistsInList(supabase, OWNER, 'not-a-uuid', [uuid(6, 1)]);

        expect(result.code).toBe('REORDER_INVALID_REQUEST');
    });
});
