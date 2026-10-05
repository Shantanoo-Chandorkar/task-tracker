import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// page.js has JSX inside a .js file, which the test transform skips, so the guard reads its source instead
const pageSource = readFileSync(resolve(__dirname, 'page.js'), 'utf8');

describe('list page data loading', () => {
    it("reuses the layout's per-request spaces, lists and counts instead of querying them again", () => {
        expect(pageSource).toContain('loadShellData');
        expect(pageSource).toContain('shellData.initialLists');
        expect(pageSource).not.toMatch(/from\('spaces'\)/);
        expect(pageSource).not.toContain('attachTaskCounts');
        expect(pageSource).not.toContain('attachMyPermissionLevel');
    });

    it('reads the signed-in user through the per-request cache, not a second Auth call', () => {
        expect(pageSource).toContain('loadRequestUser');
        expect(pageSource).not.toContain('getCurrentUser');
    });

    it('queries the lists table once, for this list only', () => {
        const listsQueries = pageSource.match(/from\('lists'\)/g) ?? [];
        expect(listsQueries).toHaveLength(1);
        expect(pageSource).toMatch(/from\('lists'\)\.select\('id, space_id'\)\.eq\('id', listId\)/);
    });

    it('stops with the generic load error when any of its own reads fail', () => {
        expect(pageSource).toMatch(
            /throwIfQueryFailed\('\[list-page\]', listResult, tasksResult, sublistsResult\)/,
        );
    });
});
