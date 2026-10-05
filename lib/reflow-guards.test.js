import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// jsdom cannot measure layout, so these guard the classes that let text scale and reflow
function readSource(relativePath) {
    return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

function listSourceFiles(directory) {
    return readdirSync(directory).flatMap((entryName) => {
        const entryPath = join(directory, entryName);
        if (statSync(entryPath).isDirectory()) return listSourceFiles(entryPath);
        return /\.(jsx?|css)$/.test(entryName) && !/\.test\./.test(entryName) ? [entryPath] : [];
    });
}

describe('text scales with the browser font size (WCAG 1.4.4)', () => {
    it('has no text sized in px in components or app', () => {
        const filesWithPxText = ['components', 'app']
            .flatMap((directory) => listSourceFiles(resolve(process.cwd(), directory)))
            .filter((filePath) => /text-\[\d+(\.\d+)?px\]/.test(readFileSync(filePath, 'utf8')));

        expect(filesWithPxText).toEqual([]);
    });
});

describe('content reflows (WCAG 1.4.10)', () => {
    const taskRowSource = readSource('components/task-list/TaskRow.jsx');

    it('wraps long task titles on small screens instead of cutting them off', () => {
        expect(taskRowSource).toContain('line-clamp-2 lg:line-clamp-1');
    });

    it('indents nested rows once per level, not depth times per level', () => {
        expect(taskRowSource).not.toMatch(/--row-indent[^`]*\*\s*\$\{depth\}/);
        expect(taskRowSource).toContain("depth > 0 ? 'var(--row-indent, 24px)' : 0");
    });
});

describe('text spacing never clips controls (WCAG 1.4.12)', () => {
    it('lets badges and text buttons grow instead of fixing their height', () => {
        const badgeSource = readSource('components/ui/badge.jsx');
        const buttonSource = readSource('components/ui/button.jsx');

        expect(badgeSource).toContain('min-h-5');
        expect(badgeSource).not.toMatch(/['\s]h-5\s/);
        for (const sizeClass of ['min-h-8', 'min-h-6', 'min-h-7', 'min-h-9']) {
            expect(buttonSource).toContain(sizeClass);
        }
    });
});

describe('long names and titles wrap inside their container (WCAG 1.4.10)', () => {
    const wrapFragment = 'min-w-0 [overflow-wrap:anywhere]';
    const textElementsThatWrap = [
        ['components/task-detail/TaskDetail.jsx', 'text-lg font-semibold text-foreground flex-1'],
        ['components/custom/RichTextRenderer.jsx', '[&_pre]:overflow-x-auto [&_img]:max-w-full'],
        ['components/status/StatusBadge.jsx', 'max-w-full items-center'],
        ['components/status/StatusManager.jsx', 'flex-1 text-sm text-foreground'],
        [
            'components/space/manager/SpaceHeader.jsx',
            'flex-1 text-sm font-semibold text-foreground',
        ],
        ['components/space/manager/ListRow.jsx', 'className="flex-1 text-sm text-foreground'],
        ['components/tag/TagManager.jsx', 'flex-1 text-sm text-foreground'],
        ['components/task-list/TaskFilterSheet.jsx', 'text-sm text-foreground flex-1'],
        ['components/task-list/ListHeader.jsx', 'text-lg font-semibold text-foreground'],
        ['components/task-list/ListHeader.jsx', 'text-xs text-muted-foreground'],
    ];

    it.each(textElementsThatWrap)('%s wraps the text next to %s', (filePath, nearbyClasses) => {
        const fileSource = readSource(filePath);
        const classStart = fileSource.indexOf(nearbyClasses);

        expect(classStart).toBeGreaterThan(-1);
        expect(fileSource.slice(classStart, classStart + 220)).toContain(
            nearbyClasses.startsWith('[&_') ? nearbyClasses : wrapFragment,
        );
    });
});
