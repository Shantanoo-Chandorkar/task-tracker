import { describe, expect, it } from 'vitest';
import { createFakeSupabase } from '@/actions/test-support/fake-supabase';
import { loadLabelForWrite } from './load-label-for-write';

const OWNER_ID = 'user-owner';
const COLLABORATOR_ID = 'user-collab';
const NOT_FOUND = { error: 'Thing not found' };

function buildClient({ callerId, collaboratorLevel = null }) {
    return createFakeSupabase({
        tables: {
            spaces: [{ id: 'space-1', owner_id: OWNER_ID }],
            space_collaborators: collaboratorLevel
                ? [
                      {
                          space_id: 'space-1',
                          user_id: COLLABORATOR_ID,
                          status: 'accepted',
                          permission_level: collaboratorLevel,
                      },
                  ]
                : [],
            statuses: [
                { id: 'mine', space_id: 'space-1', created_by: COLLABORATOR_ID, code: 'x' },
                { id: 'theirs', space_id: 'space-1', created_by: OWNER_ID, code: 'y' },
            ],
        },
        getCallerId: () => callerId,
    }).client;
}

const load = (client, user, id, extra = {}) =>
    loadLabelForWrite(client, user, {
        table: 'statuses',
        id,
        notFoundFailure: NOT_FOUND,
        ...extra,
    });

describe('loadLabelForWrite', () => {
    it('hands back the row for an owner', async () => {
        const client = buildClient({ callerId: OWNER_ID });

        const loaded = await load(client, { id: OWNER_ID }, 'theirs');

        expect(loaded.failure).toBeNull();
        expect(loaded.label).toMatchObject({ space_id: 'space-1', created_by: OWNER_ID });
    });

    it('hands back the failure given for a missing row, without reading permission', async () => {
        const client = buildClient({ callerId: OWNER_ID });

        expect(await load(client, { id: OWNER_ID }, 'gone')).toEqual({
            label: null,
            failure: NOT_FOUND,
        });
    });

    it('lets a restricted collaborator through only for their own row', async () => {
        const client = buildClient({ callerId: COLLABORATOR_ID, collaboratorLevel: 'restricted' });
        const user = { id: COLLABORATOR_ID };

        expect((await load(client, user, 'mine')).failure).toBeNull();
        expect((await load(client, user, 'theirs')).failure).toMatchObject({
            code: 'PERMISSION_RESTRICTED_NOT_OWN',
        });
    });

    it('refuses a read-only collaborator', async () => {
        const client = buildClient({ callerId: COLLABORATOR_ID, collaboratorLevel: 'read_only' });

        expect((await load(client, { id: COLLABORATOR_ID }, 'mine')).failure).toMatchObject({
            code: 'PERMISSION_READ_ONLY',
        });
    });

    it('reads the extra columns the caller asked for', async () => {
        const client = buildClient({ callerId: OWNER_ID });

        const loaded = await load(client, { id: OWNER_ID }, 'theirs', { columns: 'code' });

        expect(loaded.label.code).toBe('y');
    });
});
