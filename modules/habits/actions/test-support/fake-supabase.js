/**
 * In-memory Supabase client for habit action tests; filters every query to the caller's own rows, as RLS would.
 */

const MAX_ROWS = 1000;

/**
 * Builds a fake client over plain arrays of rows.
 *
 * @param {object} options
 * @param {Record<string, object[]>} options.tables - Rows per table name.
 * @param {() => string} [options.getCallerId] - Id the database would read from the login token (`auth.uid()`).
 * @param {object} [options.insertError] - Error every insert answers with, instead of storing the row.
 * @param {object} [options.updateError] - Error every update answers with, instead of changing rows.
 * @param {object} [options.deleteError] - Error every delete answers with, instead of removing rows.
 * @returns {{ client: object, queries: object[], updates: object[], inserts: object[], deletes: object[] }}
 *   The client, plus records for assertions.
 */
export function createFakeSupabase({
    tables,
    getCallerId = () => null,
    insertError = null,
    updateError = null,
    deleteError = null,
}) {
    const queries = [];
    const updates = [];
    const inserts = [];
    const deletes = [];
    let insertedRowCount = 0;

    function ownRows(tableName) {
        const callerId = getCallerId();
        return (tables[tableName] ?? []).filter((row) =>
            row.user_id === undefined ? true : row.user_id === callerId,
        );
    }

    function from(tableName) {
        const filters = [];
        let selectColumns = null;
        let orderColumn = null;
        let isAscending = true;
        let pendingUpdate = null;
        let pendingInsert = null;
        let pendingUpsert = null;
        let isDeleting = false;

        function addFilter(operator, column, value) {
            filters.push({ operator, column, value });
            return builder;
        }

        function matchingRows() {
            let rows = ownRows(tableName).filter((row) =>
                filters.every(({ operator, column, value }) => {
                    if (operator === 'eq') return row[column] === value;
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
            rows = rows.slice(0, MAX_ROWS);
            queries.push({ tableName, filters: [...filters], selectColumns });
            return rows;
        }

        const builder = {
            select(columns) {
                selectColumns = columns;
                return builder;
            },
            eq: (column, value) => addFilter('eq', column, value),
            is: (column, value) => addFilter('is', column, value),
            in: (column, values) => addFilter('in', column, values),
            order(column, { ascending = true } = {}) {
                orderColumn = column;
                isAscending = ascending;
                return builder;
            },
            limit: () => builder,
            insert(values) {
                pendingInsert = values;
                inserts.push({ tableName, values });
                return builder;
            },
            update(values) {
                pendingUpdate = values;
                updates.push({ tableName, values });
                return builder;
            },
            upsert(values, { onConflict } = {}) {
                pendingUpsert = {
                    rows: Array.isArray(values) ? values : [values],
                    conflictColumns: onConflict ? onConflict.split(',') : ['id'],
                };
                inserts.push({ tableName, values, isUpsert: true });
                return builder;
            },
            delete() {
                isDeleting = true;
                deletes.push({ tableName, filters });
                return builder;
            },
            single: async () => {
                if (pendingInsert) {
                    if (insertError) return { data: null, error: insertError };
                    insertedRowCount += 1;
                    const insertedRow = {
                        id: `${tableName}-new-${insertedRowCount}`,
                        ...pendingInsert,
                    };
                    (tables[tableName] ??= []).push(insertedRow);
                    return { data: insertedRow, error: null };
                }
                const rows = matchingRows();
                return rows.length === 1
                    ? { data: rows[0], error: null }
                    : { data: null, error: { code: 'PGRST116', message: 'no single row' } };
            },
            maybeSingle: async () => {
                if (pendingUpdate && updateError) return { data: null, error: updateError };
                if (isDeleting && deleteError) return { data: null, error: deleteError };
                const row = matchingRows()[0] ?? null;
                if (pendingUpdate && row) Object.assign(row, pendingUpdate);
                if (isDeleting && row) tables[tableName].splice(tables[tableName].indexOf(row), 1);
                return { data: row, error: null };
            },
            then(resolve) {
                if (pendingUpsert) {
                    if (insertError) return resolve({ data: null, error: insertError });
                    const { rows, conflictColumns } = pendingUpsert;
                    const storedRows = (tables[tableName] ??= []);
                    const resultRows = rows.map((row) => {
                        const existingRow = storedRows.find((stored) =>
                            conflictColumns.every((column) => stored[column] === row[column]),
                        );
                        if (existingRow) {
                            Object.assign(existingRow, row);
                            return existingRow;
                        }
                        insertedRowCount += 1;
                        const insertedRow = { id: `${tableName}-new-${insertedRowCount}`, ...row };
                        storedRows.push(insertedRow);
                        return insertedRow;
                    });
                    return resolve({ data: resultRows, error: null });
                }
                if (isDeleting) {
                    if (deleteError) return resolve({ data: null, error: deleteError });
                    const removedRows = matchingRows();
                    tables[tableName] = tables[tableName].filter(
                        (row) => !removedRows.includes(row),
                    );
                    return resolve({ data: removedRows, error: null });
                }
                const rows = matchingRows();
                return resolve({ data: rows, error: null });
            },
        };
        return builder;
    }

    return { client: { from }, queries, updates, inserts, deletes };
}
