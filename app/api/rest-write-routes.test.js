import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// The UI fetches only task PATCH and move (Server Actions queue, cannot abort); the rest serve e2e specs.
const ALLOWED_WRITE_ROUTES = [
    'lists/[id]/route.js: DELETE PATCH',
    'sublists/[id]/route.js: DELETE PATCH',
    'statuses/[id]/route.js: DELETE PATCH',
    'tasks/[id]/move/route.js: POST',
    'tasks/[id]/route.js: DELETE PATCH',
    'tasks/route.js: POST',
    'webhooks/deliver/route.js: POST',
];

const API_DIRECTORY = join(process.cwd(), 'app', 'api');

/**
 * Lists every route.js under app/api, depth first.
 *
 * @param {string} directory - Folder to scan
 * @returns {string[]} Absolute paths of the route files
 */
function findRouteFiles(directory) {
    return readdirSync(directory).flatMap((entry) => {
        const entryPath = join(directory, entry);
        if (statSync(entryPath).isDirectory()) return findRouteFiles(entryPath);
        return entry === 'route.js' ? [entryPath] : [];
    });
}

describe('REST write routes', () => {
    it('only the agreed routes accept writes, so no unused write path grows back', () => {
        const writeRoutes = findRouteFiles(API_DIRECTORY)
            .map((routeFile) => {
                const writeMethods = [
                    ...readFileSync(routeFile, 'utf8').matchAll(
                        /export (?:const|async function) (POST|PATCH|PUT|DELETE)\b/g,
                    ),
                ]
                    .map((match) => match[1])
                    .sort();
                const routePath = relative(API_DIRECTORY, routeFile).split(sep).join('/');
                return writeMethods.length > 0 ? `${routePath}: ${writeMethods.join(' ')}` : null;
            })
            .filter(Boolean)
            .sort();

        expect(writeRoutes).toEqual([...ALLOWED_WRITE_ROUTES].sort());
    });
});
