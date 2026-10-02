import { describe, expect, it, vi } from 'vitest';
import { findOwnRowById, insertRowOnce, readClientId } from './idempotent-create';

const CLIENT_ID = '3f2b1c4e-5d6a-4b7c-8d9e-0a1b2c3d4e5f';

/**
 * A minimal stand-in for the Supabase client: one lookup result and one insert result.
 */
function fakeSupabase({ existingRow = null, insertResults = [] }) {
    const insertedRows = [];
    const lookupIds = [];
    const remainingInserts = [...insertResults];
    return {
        insertedRows,
        lookupIds,
        from: () => ({
            select: () => ({
                eq: (_column, rowId) => {
                    lookupIds.push(rowId);
                    return { maybeSingle: async () => ({ data: existingRow }) };
                },
            }),
            insert: (row) => {
                insertedRows.push(row);
                return { select: () => ({ single: async () => remainingInserts.shift() }) };
            },
        }),
    };
}

describe('readClientId', () => {
    it.each([[{}], [{ id: undefined }], [{ id: null }], [{ id: '' }]])(
        'treats %j as no id, so the database default is used',
        (fields) => {
            expect(readClientId(fields)).toEqual({ id: undefined, failure: null });
        },
    );

    it('accepts a well-formed UUID', () => {
        expect(readClientId({ id: CLIENT_ID })).toEqual({ id: CLIENT_ID, failure: null });
    });

    it.each([['not-a-uuid'], [42], ['3f2b1c4e-5d6a-4b7c-8d9e'], [{}]])(
        'rejects %j with a stable code',
        (badId) => {
            const { id, failure } = readClientId({ id: badId });

            expect(id).toBeUndefined();
            expect(failure).toEqual({
                error: 'Invalid request id',
                code: 'INVALID_REQUEST_ID',
            });
        },
    );
});

describe('findOwnRowById', () => {
    it('does not query at all when there is no id', async () => {
        const supabase = fakeSupabase({ existingRow: { id: CLIENT_ID, created_by: 'user-1' } });

        const foundRow = await findOwnRowById(supabase, 'lists', undefined, 'created_by', 'user-1');

        expect(foundRow).toBeNull();
        expect(supabase.lookupIds).toEqual([]);
    });

    it('returns the row when the caller created it', async () => {
        const existingRow = { id: CLIENT_ID, created_by: 'user-1' };
        const supabase = fakeSupabase({ existingRow });

        expect(await findOwnRowById(supabase, 'lists', CLIENT_ID, 'created_by', 'user-1')).toBe(
            existingRow,
        );
    });

    it('never returns a row that belongs to someone else', async () => {
        const supabase = fakeSupabase({ existingRow: { id: CLIENT_ID, created_by: 'user-2' } });

        expect(
            await findOwnRowById(supabase, 'lists', CLIENT_ID, 'created_by', 'user-1'),
        ).toBeNull();
    });

    it('uses the owner column it is given, as spaces use owner_id', async () => {
        const existingRow = { id: CLIENT_ID, owner_id: 'user-1' };
        const supabase = fakeSupabase({ existingRow });

        expect(await findOwnRowById(supabase, 'spaces', CLIENT_ID, 'owner_id', 'user-1')).toBe(
            existingRow,
        );
    });
});

describe('insertRowOnce', () => {
    const ownerOptions = { ownerColumn: 'created_by', userId: 'user-1' };

    it('inserts without an id when none was given', async () => {
        const supabase = fakeSupabase({ insertResults: [{ data: { id: 'new' }, error: null }] });

        const { data } = await insertRowOnce(supabase, 'lists', { name: 'A' }, ownerOptions);

        expect(supabase.insertedRows).toEqual([{ name: 'A' }]);
        expect(data).toEqual({ id: 'new' });
    });

    it('inserts with the client id when one was given', async () => {
        const supabase = fakeSupabase({
            insertResults: [{ data: { id: CLIENT_ID }, error: null }],
        });

        await insertRowOnce(
            supabase,
            'lists',
            { name: 'A' },
            { ...ownerOptions, clientId: CLIENT_ID },
        );

        expect(supabase.insertedRows).toEqual([{ id: CLIENT_ID, name: 'A' }]);
    });

    it('returns the winner when two requests with the same id race and one loses', async () => {
        const winnerRow = { id: CLIENT_ID, created_by: 'user-1' };
        const supabase = fakeSupabase({
            existingRow: winnerRow,
            insertResults: [{ data: null, error: { code: '23505' } }],
        });

        const { data, error } = await insertRowOnce(
            supabase,
            'lists',
            { name: 'A' },
            { ...ownerOptions, clientId: CLIENT_ID },
        );

        expect(data).toBe(winnerRow);
        expect(error).toBeNull();
    });

    it("keeps the error when the clashing row is not the caller's", async () => {
        const duplicateError = { code: '23505' };
        const supabase = fakeSupabase({
            existingRow: { id: CLIENT_ID, created_by: 'user-2' },
            insertResults: [{ data: null, error: duplicateError }],
        });

        const { data, error } = await insertRowOnce(
            supabase,
            'lists',
            { name: 'A' },
            { ...ownerOptions, clientId: CLIENT_ID },
        );

        expect(data).toBeNull();
        expect(error).toBe(duplicateError);
    });

    it('passes other database errors through untouched', async () => {
        const otherError = { code: '42501' };
        const supabase = fakeSupabase({ insertResults: [{ data: null, error: otherError }] });
        const lookupSpy = vi.spyOn(supabase, 'from');

        const { error } = await insertRowOnce(
            supabase,
            'lists',
            { name: 'A' },
            { ...ownerOptions, clientId: CLIENT_ID },
        );

        expect(error).toBe(otherError);
        expect(lookupSpy).toHaveBeenCalledTimes(1);
    });
});
