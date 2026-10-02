import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// layout.js has JSX inside a .js file, which the test transform skips, so the guard reads its source instead
const rootLayoutSource = readFileSync(resolve(__dirname, 'layout.js'), 'utf8');
const toasterTag = rootLayoutSource.slice(
    rootLayoutSource.indexOf('<Toaster'),
    rootLayoutSource.indexOf('/>', rootLayoutSource.indexOf('<Toaster')),
);

describe('root layout toaster', () => {
    it('keeps toasts on screen for at least ten seconds, since errors are often the only feedback', () => {
        const duration = Number(toasterTag.match(/duration=\{(\d+)\}/)?.[1]);

        expect(duration).toBeGreaterThanOrEqual(10000);
    });

    it('offers a close button so a long-lived toast can be dismissed', () => {
        expect(toasterTag).toMatch(/\bcloseButton\b/);
    });
});
