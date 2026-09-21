import { describe, expect, it } from 'vitest';
import { formatExport } from './formatExport';

const exportScope = {
    scopeName: 'PWA Apps',
    rows: [
        {
            id: '1',
            parent_id: null,
            title: 'Parent, "quoted"',
            description: null,
            status: 'To Do',
            is_recurring: false,
            due_date: null,
            depth: 0,
            space: 'Personal',
            list: 'PWA Apps',
            sublist: null,
            parent_path: null,
        },
        {
            id: '2',
            parent_id: '1',
            title: 'Child',
            description: 'multi\nline',
            status: 'Done',
            is_recurring: true,
            due_date: '2026-01-01',
            depth: 1,
            space: 'Personal',
            list: 'PWA Apps',
            sublist: null,
            parent_path: 'Parent, "quoted"',
        },
    ],
};

/**
 * Exports a single task with the given title as CSV and returns that task's data row.
 *
 * @param {string} taskTitle - Title to place in the exported row.
 * @returns {string} The CSV data row (second line of the export).
 */
function exportTitleAsCsvRow(taskTitle) {
    const { body: csvBody } = formatExport({ scopeName: 'Single task', rows: [{ title: taskTitle }] }, 'csv');
    return csvBody.split('\n')[1];
}

describe('formatExport', () => {
    it('escapes commas/quotes/newlines in CSV output', () => {
        const { body: csvBody, contentType, filename } = formatExport(exportScope, 'csv');
        expect(contentType).toBe('text/csv');
        expect(filename).toBe('pwa-apps-export.csv');
        expect(csvBody).toContain('"Parent, ""quoted"""');
        expect(csvBody).toContain('"multi\nline"');
    });

    it('nests children in JSON output via the shared tree builder', () => {
        const { body: jsonBody, contentType, filename } = formatExport(exportScope, 'json');
        expect(contentType).toBe('application/json');
        expect(filename).toBe('pwa-apps-export.json');
        const parsedExport = JSON.parse(jsonBody);
        expect(parsedExport.scope).toBe('PWA Apps');
        expect(parsedExport.tasks).toHaveLength(1);
        expect(parsedExport.tasks[0].children).toHaveLength(1);
        expect(parsedExport.tasks[0].children[0].title).toBe('Child');
    });

    it('outputs only the header row for CSV with no tasks', () => {
        const { body: csvBody } = formatExport({ scopeName: 'Empty', rows: [] }, 'csv');
        expect(csvBody.split('\n')).toHaveLength(1);
        expect(csvBody.startsWith('space,list,sublist')).toBe(true);
    });

    it('outputs an empty task array for JSON with no tasks', () => {
        const { body: jsonBody } = formatExport({ scopeName: 'Empty', rows: [] }, 'json');
        expect(JSON.parse(jsonBody).tasks).toEqual([]);
    });

    it('writes null, undefined and missing fields as empty CSV cells, but keeps a depth of 0', () => {
        const { body: csvBody } = formatExport(
            { scopeName: 'Gaps', rows: [{ title: 'Only title', depth: 0, description: undefined }] },
            'csv',
        );
        expect(csvBody.split('\n')[1]).toBe(',,,,0,Only title,,,,');
    });

    it('falls back to CSV for an unrecognised format', () => {
        expect(formatExport(exportScope, 'xml').contentType).toBe('text/csv');
    });

    it('builds a safe filename from a scope name full of symbols or path separators', () => {
        expect(formatExport({ scopeName: '../../etc/passwd', rows: [] }, 'csv').filename).toBe('etc-passwd-export.csv');
        expect(formatExport({ scopeName: '!!!', rows: [] }, 'csv').filename).toBe('export-export.csv');
    });

    it('keeps a task whose parent is not in the export as a top-level JSON task', () => {
        const orphanRows = [{ id: '9', parent_id: 'not-exported', title: 'Orphan' }];
        const { body: jsonBody } = formatExport({ scopeName: 'Orphans', rows: orphanRows }, 'json');
        expect(JSON.parse(jsonBody).tasks.map((task) => task.title)).toEqual(['Orphan']);
    });

    it.each(['=', '+', '-', '@'])('prefixes a title starting with %s so spreadsheets treat it as text', (formulaTrigger) => {
        expect(exportTitleAsCsvRow(`${formulaTrigger}SUM(A1)`)).toContain(`'${formulaTrigger}SUM(A1)`);
    });

    it('keeps the formula neutralised when the title also needs quoting', () => {
        expect(exportTitleAsCsvRow('=HYPERLINK("http://evil","x")')).toBe(',,,,,"\'=HYPERLINK(""http://evil"",""x"")",,,,');
    });

    it('does not alter ordinary titles or ISO dates', () => {
        expect(exportTitleAsCsvRow('Plan 2026-01-01')).toBe(',,,,,Plan 2026-01-01,,,,');
    });

    it('quotes CSV fields that contain a carriage return', () => {
        expect(exportTitleAsCsvRow('line1\rline2')).toContain('"line1\rline2"');
    });

    it('never includes id/parent_id in CSV or JSON output', () => {
        const csvExport = formatExport(exportScope, 'csv');
        expect(csvExport.body).not.toMatch(/\bid\b/);

        const jsonExport = formatExport(exportScope, 'json');
        const parsedExport = JSON.parse(jsonExport.body);
        expect(parsedExport.tasks[0]).not.toHaveProperty('id');
        expect(parsedExport.tasks[0]).not.toHaveProperty('parent_id');
        expect(parsedExport.tasks[0].children[0]).not.toHaveProperty('id');
    });
});
