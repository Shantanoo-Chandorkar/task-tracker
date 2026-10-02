import { SERVER_LOAD_FAILED } from '@/lib/error-codes';

/**
 * Stops a server page from rendering a database failure as empty or missing data.
 *
 * @param {string} logLabel - Prefix identifying the caller in server logs, e.g. '[list-page]'.
 * @param {...{ error: object|null }} queryResults - Supabase `{ data, error }` results to check.
 * @throws {Error} Generic SERVER_LOAD_FAILED error when any result carries an error; detail is only logged.
 */
export function throwIfQueryFailed(logLabel, ...queryResults) {
    const failedResults = queryResults.filter((queryResult) => queryResult?.error);
    if (failedResults.length === 0) return;

    for (const { error } of failedResults) {
        console.error(`${logLabel} query failed`, { code: error.code, detail: error.message });
    }
    throw new Error(SERVER_LOAD_FAILED);
}
