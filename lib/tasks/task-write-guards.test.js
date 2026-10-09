import { describe, expect, it } from 'vitest';
import { createFakeSupabase } from '@/actions/test-support/fake-supabase';
import { buildTaskTables, COLLABORATOR_ID, OWNER_ID } from '@/actions/test-support/task-fixtures';
import {
    blockCreateInSpace,
    blockIfSublistNotInList,
    blockIfSubtaskCapReached,
    blockWriteInSpace,
} from './task-write-guards';

function clientFor(callerId, tablesOptions) {
    return createFakeSupabase({
        tables: buildTaskTables(tablesOptions),
        getCallerId: () => callerId,
    }).client;
}

describe('blockCreateInSpace', () => {
    it.each([
        [OWNER_ID, undefined, null],
        [COLLABORATOR_ID, 'full', null],
        [COLLABORATOR_ID, 'restricted', null],
        [COLLABORATOR_ID, 'read_only', 'PERMISSION_READ_ONLY'],
        ['user-stranger', undefined, 'PERMISSION_NOT_A_MEMBER'],
    ])('caller %s with tier %s gets %s', async (callerId, collaboratorLevel, expectedCode) => {
        const supabase = clientFor(callerId, { collaboratorLevel });

        const refusal = await blockCreateInSpace(supabase, 'space-1');

        expect(refusal?.code ?? null).toBe(expectedCode);
    });
});

describe('blockWriteInSpace', () => {
    it('lets the owner change any row', async () => {
        const supabase = clientFor(OWNER_ID);

        expect(await blockWriteInSpace(supabase, 'space-1', OWNER_ID, 'someone-else')).toBeNull();
    });

    it('lets a restricted collaborator change only rows they created', async () => {
        const supabase = clientFor(COLLABORATOR_ID, { collaboratorLevel: 'restricted' });

        expect(
            await blockWriteInSpace(supabase, 'space-1', COLLABORATOR_ID, COLLABORATOR_ID),
        ).toBeNull();
        expect(
            await blockWriteInSpace(supabase, 'space-1', COLLABORATOR_ID, OWNER_ID),
        ).toMatchObject({ code: 'PERMISSION_RESTRICTED_NOT_OWN' });
    });
});

describe('blockIfSubtaskCapReached', () => {
    it('refuses when the parent already has the maximum number of subtasks', async () => {
        const supabase = clientFor(OWNER_ID, { space: { max_subtasks_per_parent: 1 } });

        expect(await blockIfSubtaskCapReached(supabase, 'task-1')).toMatchObject({
            code: 'TASK_SUBTASK_CAP_REACHED',
            error: 'This task already has the maximum of 1 subtasks',
        });
    });

    it('allows another subtask while under the cap', async () => {
        const supabase = clientFor(OWNER_ID, { space: { max_subtasks_per_parent: 2 } });

        expect(await blockIfSubtaskCapReached(supabase, 'task-1')).toBeNull();
    });

    it('allows any number when the space has no cap', async () => {
        const supabase = clientFor(OWNER_ID);

        expect(await blockIfSubtaskCapReached(supabase, 'task-1')).toBeNull();
    });

    it('says so when the parent task does not exist', async () => {
        const supabase = clientFor(OWNER_ID);

        expect(await blockIfSubtaskCapReached(supabase, 'task-missing')).toMatchObject({
            code: 'TASK_NOT_FOUND',
        });
    });
});

describe('blockIfSublistNotInList', () => {
    it('allows a sublist of the same list', async () => {
        const supabase = clientFor(OWNER_ID);

        expect(await blockIfSublistNotInList(supabase, 'sublist-1', 'list-1')).toBeNull();
    });

    it.each([
        ['a sublist of another list', 'sublist-2'],
        ['a sublist that does not exist', 'sublist-missing'],
    ])('refuses %s', async (label, sublistId) => {
        const supabase = clientFor(OWNER_ID);

        expect(await blockIfSublistNotInList(supabase, sublistId, 'list-1')).toEqual({
            error: 'Sublist does not belong to this list',
        });
    });
});
