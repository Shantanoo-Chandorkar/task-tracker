import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// jsdom cannot measure layout, so these guard the classes that give each small control its tap area
function readSource(relativePath) {
    return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

const smallControls = [
    ['components/task-list/TaskRow.jsx', 'hit-area flex-shrink-0 w-4 h-4'],
    ['components/task-list/TaskRow.jsx', 'hit-area hidden lg:flex flex-shrink-0 h-4 w-4'],
    ['components/task-list/TaskRowTags.jsx', 'hit-area flex-shrink-0'],
    ['components/task-list/TaskFilterBar.jsx', 'hit-area hover:text-destructive'],
    ['components/task-list/LimitWarning.jsx', 'hit-area text-amber-700'],
    ['components/task-detail/SubtaskTree.jsx', 'hit-area flex-shrink-0 w-4 h-4'],
    ['components/task-detail/SubtaskTree.jsx', '<label className="hit-area flex flex-shrink-0">'],
    ['components/space/SpaceListManager.jsx', 'hit-area [--hit-size:44px] touch-none'],
    ['components/status/StatusManager.jsx', 'hit-area [--hit-size:44px] touch-none'],
    ['components/nav/MobileNavDrawer.jsx', 'hit-area [--hit-size:44px]'],
    ['components/nav/MobileTopBar.jsx', 'hit-area [--hit-size:44px]'],
    ['components/nav/LogoutButton.jsx', 'hit-area [--hit-size:44px]'],
    ['components/custom/RowActionsMenu.jsx', 'hit-area [--hit-size:44px] lg:[--hit-size:24px]'],
];

describe('tap area of small controls (WCAG 2.5.8)', () => {
    it.each(smallControls)('%s carries %s', (filePath, expectedFragment) => {
        expect(readSource(filePath)).toContain(expectedFragment);
    });

    it('defines hit-area as a pseudo-element of at least 24px that follows --hit-size', () => {
        const globalsCss = readSource('app/globals.css');

        expect(globalsCss).toMatch(
            /\.hit-area::after\s*{[^}]*min-width:\s*var\(--hit-size,\s*24px\)/,
        );
        expect(globalsCss).toMatch(
            /\.hit-area::after\s*{[^}]*min-height:\s*var\(--hit-size,\s*24px\)/,
        );
    });
});

describe('focus not hidden by sticky bars (WCAG 2.4.11)', () => {
    it('pads scrolling below the top bar and above the bottom nav on small screens', () => {
        const globalsCss = readSource('app/globals.css');

        expect(globalsCss).toMatch(/html\s*{[^}]*scroll-padding-top:[^;]*--guest-banner-height/);
        expect(globalsCss).toMatch(
            /html\s*{[^}]*scroll-padding-bottom:[^;]*safe-area-inset-bottom/,
        );
    });
});
