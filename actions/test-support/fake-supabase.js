/**
 * In-memory Supabase client for action tests that need real filtering over a few rows.
 */

const MAX_ROWS = 1000;

/**
 * Builds a fake client over plain arrays of rows.
 *
 * @param {object} options
 * @param {Record<string, object[]>} options.tables - Rows per table name
 * @param {(args: object) => object} [options.moveRpcResult] - Builds the `move_task_subtree` reply from its args
 * @returns {{ client: object, rpcCalls: object[], queries: object[] }} The client, plus records for assertions
 */
export function createFakeSupabase({ tables, moveRpcResult }) {
    const rpcCalls = [];
    const queries = [];

    function attachJoins(tableName, selectColumns, row) {
        if (tableName === 'tasks' && selectColumns?.includes('lists(')) {
            const list = tables.lists.find((candidate) => candidate.id === row.list_id);
            return { ...row, lists: list ? { space_id: list.space_id } : null };
        }
        return row;
    }

    function from(tableName) {
        const filters = [];
        let selectColumns = null;
        let selectOptions = null;
        let orderColumn = null;
        let isAscending = true;
        let rangeStart = null;
        let rangeEnd = null;

        function addFilter(operator, column, value) {
            filters.push({ operator, column, value });
            return builder;
        }

        function matchingRows() {
            let rows = (tables[tableName] ?? []).filter((row) =>
                filters.every(({ operator, column, value }) => {
                    if (operator === 'eq') return row[column] === value;
                    if (operator === 'neq') return row[column] !== value;
                    if (operator === 'is') return (row[column] ?? null) === value;
                    if (operator === 'in') return value.includes(row[column]);
                    return true;
                }),
            );
            if (orderColumn) {
                rows = [...rows].sort(
                    (first, second) =>
                        (first[orderColumn] > second[orderColumn] ? 1 : -1) *
                        (isAscending ? 1 : -1),
                );
            }
            // Like PostgREST's default Max rows: an unpaged read silently stops at 1000 rows
            rows =
                rangeStart === null
                    ? rows.slice(0, MAX_ROWS)
                    : rows.slice(rangeStart, Math.min(rangeEnd + 1, rangeStart + MAX_ROWS));
            queries.push({ tableName, filters: [...filters], selectColumns });
            return rows.map((row) => attachJoins(tableName, selectColumns, row));
        }

        const builder = {
            select(columns, options) {
                selectColumns = columns;
                selectOptions = options ?? null;
                return builder;
            },
            eq: (column, value) => addFilter('eq', column, value),
            neq: (column, value) => addFilter('neq', column, value),
            is: (column, value) => addFilter('is', column, value),
            in: (column, value) => addFilter('in', column, value),
            order(column, { ascending = true } = {}) {
                orderColumn = column;
                isAscending = ascending;
                return builder;
            },
            limit: () => builder,
            range(start, end) {
                rangeStart = start;
                rangeEnd = end;
                return builder;
            },
            single: async () => {
                const rows = matchingRows();
                return rows.length === 1
                    ? { data: rows[0], error: null }
                    : { data: null, error: { code: 'PGRST116', message: 'no single row' } };
            },
            maybeSingle: async () => ({ data: matchingRows()[0] ?? null, error: null }),
            then(resolve) {
                const rows = matchingRows();
                if (selectOptions?.head)
                    return resolve({ data: null, count: rows.length, error: null });
                return resolve({ data: rows, error: null });
            },
        };
        return builder;
    }

    function rpc(functionName, args) {
        rpcCalls.push({ functionName, args });
        const reply = moveRpcResult
            ? moveRpcResult(args)
            : { data: { id: args.p_task_id }, error: null };
        return { single: async () => reply };
    }

    return { client: { from, rpc }, rpcCalls, queries };
}
