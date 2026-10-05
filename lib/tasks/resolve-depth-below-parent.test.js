import { describe, expect, it } from 'vitest';
import { createFakeSupabase } from '@/actions/test-support/fake-supabase';
import { buildTaskTables } from '@/actions/test-support/task-fixtures';
import { resolveDepthBelowParent } from './resolve-depth-below-parent';

const { client } = createFakeSupabase({ tables: buildTaskTables() });

describe('resolveDepthBelowParent', () => {
    it('is 0 when there is no parent, without reading anything', async () => {
        expect(await resolveDepthBelowParent(client, null)).toBe(0);
        expect(await resolveDepthBelowParent(client, undefined)).toBe(0);
    });

    it('is one below the parent', async () => {
        expect(await resolveDepthBelowParent(client, 'task-1')).toBe(1);
        expect(await resolveDepthBelowParent(client, 'task-2')).toBe(2);
    });

    it('falls back to 0 when the parent cannot be found', async () => {
        expect(await resolveDepthBelowParent(client, 'task-missing')).toBe(0);
    });
});
