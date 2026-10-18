import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from './test-support/fake-supabase';
import { buildTaskTables, COLLABORATOR_ID, OWNER_ID } from './test-support/task-fixtures';

const CLIENT_ID = '3f2b1c4e-5d6a-4b7c-8d9e-0a1b2c3d4e5f';

let fake;
let tables;
let currentUserId;

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fake.client }));
vi.mock('@/lib/auth/session', () => ({
    getCurrentUser: async () => currentUserId && { id: currentUserId },
}));

function buildStatusRow(id, overrides = {}) {
    return {
        id,
        space_id: 'space-1',
        name: `Name of ${id}`,
        color: '#111111',
        position: 0,
        code: null,
        is_default: false,
        created_by: OWNER_ID,
        ...overrides,
    };
}

function setUpWorld({ collaboratorLevel = null, statuses, fakeOptions } = {}) {
    tables = buildTaskTables({ collaboratorLevel });
    tables.statuses = statuses ?? [
        buildStatusRow('status-todo', { code: 'todo', is_default: true, position: 0 }),
        buildStatusRow('status-done', { code: 'done', position: 1 }),
        buildStatusRow('status-custom', { position: 2 }),
    ];
    fake = createFakeSupabase({ tables, getCallerId: () => currentUserId, ...fakeOptions });
}

async function statusActions() {
    return import('./status-actions');
}

const storedStatus = (statusId) => tables.statuses.find((status) => status.id === statusId);

beforeEach(() => {
    currentUserId = OWNER_ID;
    setUpWorld();
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('createStatus', () => {
    it('refuses a signed-out caller with the stable auth code', async () => {
        currentUserId = null;
        const { createStatus } = await statusActions();

        expect(await createStatus({ name: 'Review', space_id: 'space-1' })).toMatchObject({
            data: null,
            code: 'NOT_AUTHENTICATED',
        });
    });

    it('stores a trimmed, tag-free name after the last status, owned by the caller, with the default colour', async () => {
        const { createStatus } = await statusActions();

        const createResult = await createStatus({ name: '  <b>Review</b> ', space_id: 'space-1' });

        expect(createResult.error).toBeNull();
        expect(createResult.data).toMatchObject({
            name: 'Review',
            color: '#6b7280',
            position: 3,
            space_id: 'space-1',
            created_by: OWNER_ID,
        });
    });

    it('keeps the colour the caller sent', async () => {
        const { createStatus } = await statusActions();

        const createResult = await createStatus({
            name: 'Review',
            space_id: 'space-1',
            color: '#ff0000',
        });

        expect(createResult.data.color).toBe('#ff0000');
    });

    it.each(['red', '#fff', '#12345g', 'red; background: url(x)', 42])(
        'refuses the colour %j with the colour code and writes nothing',
        async (color) => {
            const { createStatus } = await statusActions();

            expect(
                await createStatus({ name: 'Review', space_id: 'space-1', color }),
            ).toMatchObject({ data: null, code: 'LABEL_COLOR_INVALID' });
            expect(fake.inserts).toHaveLength(0);
        },
    );

    it('uses the default colour when the colour is null', async () => {
        const { createStatus } = await statusActions();

        const createResult = await createStatus({
            name: 'Review',
            space_id: 'space-1',
            color: null,
        });

        expect(createResult.data.color).toBe('#6b7280');
    });

    it('writes only the allowed fields, never code or is_default', async () => {
        const { createStatus } = await statusActions();

        await createStatus({
            name: 'Review',
            space_id: 'space-1',
            code: 'done',
            is_default: true,
        });

        const [{ values }] = fake.inserts;
        expect(Object.keys(values).sort()).toEqual([
            'color',
            'created_by',
            'name',
            'position',
            'space_id',
        ]);
    });

    it.each([
        [{ name: '   ', space_id: 'space-1' }, 'Status name is required'],
        [{ name: '<i></i>', space_id: 'space-1' }, 'Status name is required'],
        [{ space_id: 'space-1' }, 'Status name is required'],
        [{ name: 'x'.repeat(51), space_id: 'space-1' }, 'Status name cannot exceed 50 characters.'],
        [{ name: 'Review' }, 'A space is required'],
    ])('refuses %j with the message "%s" and writes nothing', async (fields, message) => {
        const { createStatus } = await statusActions();

        expect(await createStatus(fields)).toEqual({ data: null, error: message });
        expect(fake.inserts).toHaveLength(0);
    });

    it('accepts a name of exactly 50 characters', async () => {
        const { createStatus } = await statusActions();

        const createResult = await createStatus({ name: 'x'.repeat(50), space_id: 'space-1' });

        expect(createResult.error).toBeNull();
    });

    it('refuses a client id that is not a uuid', async () => {
        const { createStatus } = await statusActions();

        expect(
            await createStatus({ id: 'nope', name: 'Review', space_id: 'space-1' }),
        ).toMatchObject({ data: null, code: 'INVALID_REQUEST_ID' });
        expect(fake.inserts).toHaveLength(0);
    });

    it('returns the first try’s own row for a repeated client id, without inserting again', async () => {
        tables.statuses.push(buildStatusRow(CLIENT_ID, { name: 'First try' }));
        const { createStatus } = await statusActions();

        const createResult = await createStatus({
            id: CLIENT_ID,
            name: 'Second try',
            space_id: 'space-1',
        });

        expect(createResult).toMatchObject({
            error: null,
            data: { id: CLIENT_ID, name: 'First try' },
        });
        expect(fake.inserts).toHaveLength(0);
    });

    it('does not hand back a row with that id that someone else made', async () => {
        tables.statuses.push(
            buildStatusRow(CLIENT_ID, { name: 'Theirs', created_by: COLLABORATOR_ID }),
        );
        setUpWorld({
            statuses: tables.statuses,
            fakeOptions: { insertError: { code: '23505', message: 'duplicate key' } },
        });
        const { createStatus } = await statusActions();

        const createResult = await createStatus({
            id: CLIENT_ID,
            name: 'Mine',
            space_id: 'space-1',
        });

        expect(createResult).toEqual({ data: null, error: 'Failed to create status' });
    });

    it('lets a restricted collaborator create a status, as for any new row', async () => {
        setUpWorld({ collaboratorLevel: 'restricted' });
        currentUserId = COLLABORATOR_ID;
        const { createStatus } = await statusActions();

        const createResult = await createStatus({ name: 'Review', space_id: 'space-1' });

        expect(createResult.error).toBeNull();
        expect(createResult.data.created_by).toBe(COLLABORATOR_ID);
    });

    it('refuses a read-only collaborator and a stranger with their codes', async () => {
        setUpWorld({ collaboratorLevel: 'read_only' });
        currentUserId = COLLABORATOR_ID;
        const { createStatus } = await statusActions();
        expect(await createStatus({ name: 'Review', space_id: 'space-1' })).toMatchObject({
            data: null,
            code: 'PERMISSION_READ_ONLY',
        });

        currentUserId = 'user-stranger';
        expect(await createStatus({ name: 'Review', space_id: 'space-1' })).toMatchObject({
            data: null,
            code: 'PERMISSION_NOT_A_MEMBER',
        });
        expect(fake.inserts).toHaveLength(0);
    });

    it('turns a guest limit error into the friendly guest result', async () => {
        setUpWorld({
            fakeOptions: {
                insertError: { code: 'P0001', message: 'GUEST_LIMIT_REACHED:statuses' },
            },
        });
        const { createStatus } = await statusActions();

        const createResult = await createStatus({ name: 'Review', space_id: 'space-1' });

        expect(createResult.data).toBeNull();
        expect(createResult.error).toContain('Guest mode is limited');
        expect(createResult.code).toBeTruthy();
    });

    it('hides a database failure behind a fixed message', async () => {
        setUpWorld({
            fakeOptions: {
                insertError: { code: 'XX000', message: 'relation "statuses" exploded' },
            },
        });
        const { createStatus } = await statusActions();

        expect(await createStatus({ name: 'Review', space_id: 'space-1' })).toEqual({
            data: null,
            error: 'Failed to create status',
        });
    });
});

describe('updateStatus', () => {
    it('needs a status id', async () => {
        const { updateStatus } = await statusActions();

        expect(await updateStatus('', { name: 'New' })).toEqual({
            data: null,
            error: 'Status ID is required',
        });
    });

    it('saves a trimmed name, a colour and a position', async () => {
        const { updateStatus } = await statusActions();

        const updateResult = await updateStatus('status-custom', {
            name: ' <b>Later</b> ',
            color: '#00ff00',
            position: 9,
        });

        expect(updateResult.error).toBeNull();
        expect(storedStatus('status-custom')).toMatchObject({
            name: 'Later',
            color: '#00ff00',
            position: 9,
        });
    });

    it('writes only the fields that were sent', async () => {
        const { updateStatus } = await statusActions();

        await updateStatus('status-custom', { color: '#00ff00' });

        expect(fake.updates).toEqual([{ tableName: 'statuses', values: { color: '#00ff00' } }]);
    });

    it('never lets the client change code, is_default, space_id or created_by', async () => {
        const { updateStatus } = await statusActions();

        await updateStatus('status-custom', {
            name: 'Later',
            code: 'done',
            is_default: true,
            space_id: 'space-2',
            created_by: COLLABORATOR_ID,
        });

        expect(fake.updates).toEqual([{ tableName: 'statuses', values: { name: 'Later' } }]);
        expect(storedStatus('status-custom')).toMatchObject({
            code: null,
            is_default: false,
            space_id: 'space-1',
            created_by: OWNER_ID,
        });
    });

    it.each(['red', '#fff', null, 42])(
        'refuses the colour %j on update with the colour code and writes nothing',
        async (color) => {
            const { updateStatus } = await statusActions();

            expect(await updateStatus('status-custom', { color })).toMatchObject({
                data: null,
                code: 'LABEL_COLOR_INVALID',
            });
            expect(fake.updates).toHaveLength(0);
        },
    );

    it.each([
        [{ name: '   ' }, 'Status name is required'],
        [{ name: '<i></i>' }, 'Status name is required'],
        [{ name: 'x'.repeat(51) }, 'Status name cannot exceed 50 characters.'],
    ])('refuses %j with "%s" and writes nothing', async (fields, message) => {
        const { updateStatus } = await statusActions();

        expect(await updateStatus('status-custom', fields)).toEqual({ data: null, error: message });
        expect(fake.updates).toHaveLength(0);
    });

    it('says the status was not found for an unknown id', async () => {
        const { updateStatus } = await statusActions();

        expect(await updateStatus('status-missing', { name: 'New' })).toEqual({
            data: null,
            error: 'Status not found',
        });
    });

    it('lets an owner and a full collaborator edit any status', async () => {
        const { updateStatus } = await statusActions();
        expect((await updateStatus('status-custom', { name: 'By owner' })).error).toBeNull();

        setUpWorld({ collaboratorLevel: 'full' });
        currentUserId = COLLABORATOR_ID;
        expect((await updateStatus('status-custom', { name: 'By full' })).error).toBeNull();
    });

    it('lets a restricted collaborator edit only the statuses they made', async () => {
        setUpWorld({
            collaboratorLevel: 'restricted',
            statuses: [
                buildStatusRow('status-mine', { created_by: COLLABORATOR_ID }),
                buildStatusRow('status-theirs'),
            ],
        });
        currentUserId = COLLABORATOR_ID;
        const { updateStatus } = await statusActions();

        expect((await updateStatus('status-mine', { name: 'Edited' })).error).toBeNull();
        expect(await updateStatus('status-theirs', { name: 'Edited' })).toMatchObject({
            data: null,
            code: 'PERMISSION_RESTRICTED_NOT_OWN',
        });
        expect(storedStatus('status-theirs').name).toBe('Name of status-theirs');
    });

    it('refuses a read-only collaborator and a stranger without writing', async () => {
        setUpWorld({ collaboratorLevel: 'read_only' });
        currentUserId = COLLABORATOR_ID;
        const { updateStatus } = await statusActions();
        expect(await updateStatus('status-custom', { name: 'Edited' })).toMatchObject({
            code: 'PERMISSION_READ_ONLY',
        });

        currentUserId = 'user-stranger';
        expect(await updateStatus('status-custom', { name: 'Edited' })).toMatchObject({
            code: 'PERMISSION_NOT_A_MEMBER',
        });
        expect(fake.updates).toHaveLength(0);
    });

    it('hides a database failure behind a fixed message', async () => {
        setUpWorld({ fakeOptions: { updateError: { code: 'XX000', message: 'boom' } } });
        const { updateStatus } = await statusActions();

        expect(await updateStatus('status-custom', { name: 'Edited' })).toEqual({
            data: null,
            error: 'Failed to update status',
        });
    });
});

describe('deleteStatus', () => {
    it('needs a status id', async () => {
        const { deleteStatus } = await statusActions();

        expect(await deleteStatus('')).toEqual({ error: 'Status ID is required' });
    });

    it('says the status was not found for an unknown id', async () => {
        const { deleteStatus } = await statusActions();

        expect(await deleteStatus('status-missing')).toEqual({ error: 'Status not found' });
    });

    it('deletes a custom status', async () => {
        const { deleteStatus } = await statusActions();

        expect(await deleteStatus('status-custom')).toEqual({ error: null });
        expect(storedStatus('status-custom')).toBeUndefined();
    });

    it('refuses to delete the last remaining status of the space', async () => {
        setUpWorld({ statuses: [buildStatusRow('status-only')] });
        const { deleteStatus } = await statusActions();

        expect(await deleteStatus('status-only')).toEqual({
            error: 'Cannot delete the last remaining status',
        });
        expect(storedStatus('status-only')).toBeDefined();
    });

    it('counts only the statuses of its own space for "last remaining"', async () => {
        setUpWorld({
            statuses: [
                buildStatusRow('status-only'),
                buildStatusRow('status-other-space', { space_id: 'space-2' }),
            ],
        });
        const { deleteStatus } = await statusActions();

        expect(await deleteStatus('status-only')).toEqual({
            error: 'Cannot delete the last remaining status',
        });
    });

    it('refuses the default status and a built-in status', async () => {
        const { deleteStatus } = await statusActions();

        expect(await deleteStatus('status-todo')).toEqual({
            error: 'Cannot delete the default status',
        });
        expect(await deleteStatus('status-done')).toEqual({
            error: 'Cannot delete a built-in status',
        });
        expect(storedStatus('status-todo')).toBeDefined();
        expect(storedStatus('status-done')).toBeDefined();
    });

    it('checks permission before it says anything about the status itself', async () => {
        setUpWorld({ collaboratorLevel: 'read_only' });
        currentUserId = COLLABORATOR_ID;
        const { deleteStatus } = await statusActions();

        expect(await deleteStatus('status-todo')).toMatchObject({ code: 'PERMISSION_READ_ONLY' });
        currentUserId = 'user-stranger';
        expect(await deleteStatus('status-todo')).toMatchObject({
            code: 'PERMISSION_NOT_A_MEMBER',
        });
    });

    it('lets a restricted collaborator delete only the statuses they made', async () => {
        setUpWorld({
            collaboratorLevel: 'restricted',
            statuses: [
                buildStatusRow('status-base'),
                buildStatusRow('status-mine', { created_by: COLLABORATOR_ID }),
                buildStatusRow('status-theirs'),
            ],
        });
        currentUserId = COLLABORATOR_ID;
        const { deleteStatus } = await statusActions();

        expect(await deleteStatus('status-theirs')).toMatchObject({
            code: 'PERMISSION_RESTRICTED_NOT_OWN',
        });
        expect(await deleteStatus('status-mine')).toEqual({ error: null });
        expect(storedStatus('status-theirs')).toBeDefined();
    });

    it('says not found when the delete removed nothing', async () => {
        setUpWorld({ fakeOptions: { deleteError: { code: 'XX000', message: 'boom' } } });
        const { deleteStatus } = await statusActions();

        expect(await deleteStatus('status-custom')).toEqual({ error: 'Status not found' });
    });
});
