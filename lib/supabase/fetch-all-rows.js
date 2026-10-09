// Supabase's default PostgREST "Max rows" setting; a page this size is the most one request can return.
export const SUPABASE_PAGE_SIZE = 1000;
// Stops a runaway loop; 50 pages is 50,000 rows, far beyond what a single list or export should hold.
const MAX_PAGES = 50;

/**
 * Reads every row of a query page by page, so a result past the PostgREST row cap is never cut short.
 *
 * @param {Function} buildPageQuery - Takes `{ from, to }`, returns one ordered `.range(from, to)` query.
 * @returns {Promise<{ data: object[]|null, error: object|null }>} Every row, or the failing page's error.
 */
export async function fetchAllRows(buildPageQuery) {
    const allRows = [];

    for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex++) {
        const from = pageIndex * SUPABASE_PAGE_SIZE;
        const { data: pageRows, error } = await buildPageQuery({
            from,
            to: from + SUPABASE_PAGE_SIZE - 1,
        });
        if (error) return { data: null, error };

        allRows.push(...(pageRows ?? []));
        if ((pageRows?.length ?? 0) < SUPABASE_PAGE_SIZE) return { data: allRows, error: null };
    }

    return {
        data: null,
        error: {
            code: 'ROW_LIMIT_EXCEEDED',
            message: `More than ${MAX_PAGES * SUPABASE_PAGE_SIZE} rows`,
        },
    };
}
