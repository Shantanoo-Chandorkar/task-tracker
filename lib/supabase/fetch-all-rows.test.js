import { describe, it, expect, vi } from 'vitest';
import { fetchAllRows, SUPABASE_PAGE_SIZE } from './fetch-all-rows';

function rowsNumbered(firstNumber, rowCount) {
    return Array.from({ length: rowCount }, (_, offset) => ({ id: firstNumber + offset }));
}

describe('fetchAllRows', () => {
    it('makes one request when the result fits in a page', async () => {
        const buildPageQuery = vi.fn().mockResolvedValue({ data: rowsNumbered(0, 3), error: null });

        const { data: allRows, error } = await fetchAllRows(buildPageQuery);

        expect(error).toBeNull();
        expect(allRows).toHaveLength(3);
        expect(buildPageQuery).toHaveBeenCalledTimes(1);
        expect(buildPageQuery).toHaveBeenCalledWith({ from: 0, to: SUPABASE_PAGE_SIZE - 1 });
    });

    it('keeps fetching past the 1000 row cap and returns every row in order', async () => {
        const buildPageQuery = vi
            .fn()
            .mockResolvedValueOnce({ data: rowsNumbered(0, SUPABASE_PAGE_SIZE), error: null })
            .mockResolvedValueOnce({ data: rowsNumbered(SUPABASE_PAGE_SIZE, 250), error: null });

        const { data: allRows } = await fetchAllRows(buildPageQuery);

        expect(allRows).toHaveLength(SUPABASE_PAGE_SIZE + 250);
        expect(allRows[0].id).toBe(0);
        expect(allRows.at(-1).id).toBe(SUPABASE_PAGE_SIZE + 249);
        expect(buildPageQuery).toHaveBeenNthCalledWith(2, {
            from: SUPABASE_PAGE_SIZE,
            to: SUPABASE_PAGE_SIZE * 2 - 1,
        });
    });

    it('asks for one more page when a page is exactly full, then stops on the empty one', async () => {
        const buildPageQuery = vi
            .fn()
            .mockResolvedValueOnce({ data: rowsNumbered(0, SUPABASE_PAGE_SIZE), error: null })
            .mockResolvedValueOnce({ data: [], error: null });

        const { data: allRows } = await fetchAllRows(buildPageQuery);

        expect(allRows).toHaveLength(SUPABASE_PAGE_SIZE);
        expect(buildPageQuery).toHaveBeenCalledTimes(2);
    });

    it('returns the error and no partial rows when a later page fails', async () => {
        const failure = { code: '57014', message: 'timeout' };
        const buildPageQuery = vi
            .fn()
            .mockResolvedValueOnce({ data: rowsNumbered(0, SUPABASE_PAGE_SIZE), error: null })
            .mockResolvedValueOnce({ data: null, error: failure });

        const { data: allRows, error } = await fetchAllRows(buildPageQuery);

        expect(allRows).toBeNull();
        expect(error).toBe(failure);
    });

    it('gives up with a stable code instead of looping forever', async () => {
        const buildPageQuery = vi
            .fn()
            .mockResolvedValue({ data: rowsNumbered(0, SUPABASE_PAGE_SIZE), error: null });

        const { data: allRows, error } = await fetchAllRows(buildPageQuery);

        expect(allRows).toBeNull();
        expect(error.code).toBe('ROW_LIMIT_EXCEEDED');
    });
});
