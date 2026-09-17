import { describe, expect, it } from 'vitest';
import { formatExport } from './formatExport';

const scope = {
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

describe('formatExport', () => {
    it('escapes commas/quotes/newlines in CSV output', () => {
        const { body, contentType, filename } = formatExport(scope, 'csv');
        expect(contentType).toBe('text/csv');
        expect(filename).toBe('pwa-apps-export.csv');
        expect(body).toContain('"Parent, ""quoted"""');
        expect(body).toContain('"multi\nline"');
    });

    it('nests children in JSON output via the shared tree builder', () => {
        const { body, contentType, filename } = formatExport(scope, 'json');
        expect(contentType).toBe('application/json');
        expect(filename).toBe('pwa-apps-export.json');
        const parsed = JSON.parse(body);
        expect(parsed.scope).toBe('PWA Apps');
        expect(parsed.tasks).toHaveLength(1);
        expect(parsed.tasks[0].children).toHaveLength(1);
        expect(parsed.tasks[0].children[0].title).toBe('Child');
    });

    it('never includes id/parent_id in CSV or JSON output', () => {
        const csv = formatExport(scope, 'csv');
        expect(csv.body).not.toMatch(/\bid\b/);

        const json = formatExport(scope, 'json');
        const parsed = JSON.parse(json.body);
        expect(parsed.tasks[0]).not.toHaveProperty('id');
        expect(parsed.tasks[0]).not.toHaveProperty('parent_id');
        expect(parsed.tasks[0].children[0]).not.toHaveProperty('id');
    });
});
