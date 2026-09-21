import { flatToTree } from '@/lib/tree';

const CSV_COLUMNS = [
    'space',
    'list',
    'sublist',
    'parent_path',
    'depth',
    'title',
    'status',
    'is_prioritised',
    'is_recurring',
    'due_date',
    'description',
];

/**
 * Strips `id`/`parent_id` from a tree of export nodes.
 *
 * Needed internally by `flatToTree` to link parent/child, but titles and `parent_path` already
 * convey a task's place in the hierarchy to users.
 *
 * @param {object[]} nodes - Tree nodes with `children` arrays
 * @returns {object[]} Same tree, each node's `id`/`parent_id` removed
 */
function stripIds(nodes) {
    return nodes.map(({ id, parent_id, children, ...rest }) => ({
        ...rest,
        children: stripIds(children),
    }));
}

/**
 * Escapes one CSV field per RFC 4180 and defuses spreadsheet formulas.
 *
 * @param {*} value - Raw field value
 * @returns {string} CSV-safe field text
 */
function csvEscape(value) {
    const rawText = value === null || value === undefined ? '' : String(value);
    // Spreadsheets run cells starting with = + - @ as formulas, so a leading ' forces plain text
    const text = /^[=+\-@\t\r]/.test(rawText) ? `'${rawText}` : rawText;
    if (/[",\r\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

/**
 * Turns a scope name into a filesystem-safe filename fragment.
 *
 * @param {string} scopeName
 * @returns {string}
 */
function slugify(scopeName) {
    return (
        scopeName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'export'
    );
}

/**
 * Formats a resolved export scope as a CSV or JSON response body.
 *
 * CSV rows are flat (any depth, no nesting); JSON keeps real nested `children`, built with the
 * same `flatToTree` the app's own task tree uses.
 * Both use human-readable context (space/list/sublist/parent_path) - titles, not ids, identify a task.
 *
 * @param {{scopeName: string, rows: object[]}} scope - Result of `resolveExportScope`
 * @param {'csv'|'json'} format
 * @returns {{body: string, contentType: string, filename: string}}
 */
export function formatExport({ scopeName, rows }, format) {
    const filenameBase = slugify(scopeName);

    if (format === 'json') {
        const body = JSON.stringify(
            {
                exported_at: new Date().toISOString(),
                scope: scopeName,
                tasks: stripIds(flatToTree(rows)),
            },
            null,
            2,
        );
        return { body, contentType: 'application/json', filename: `${filenameBase}-export.json` };
    }

    const lines = [CSV_COLUMNS.join(',')];
    for (const row of rows) {
        lines.push(CSV_COLUMNS.map((column) => csvEscape(row[column])).join(','));
    }

    return { body: lines.join('\n'), contentType: 'text/csv', filename: `${filenameBase}-export.csv` };
}
