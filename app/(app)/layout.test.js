import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// layout.js has JSX inside a .js file, which the test transform skips, so the guard reads its source instead
const layoutSource = readFileSync(resolve(__dirname, 'layout.js'), 'utf8');

describe('app layout', () => {
    it('is not async, so the frame and skeletons can stream before any data has loaded', () => {
        expect(layoutSource).toMatch(/export default function AppLayout\(/);
        expect(layoutSource).not.toMatch(/export default async function/);
    });

    it('awaits data only inside the small per-piece components under Suspense', () => {
        const layoutBody = layoutSource.slice(
            layoutSource.indexOf('export default function AppLayout'),
        );

        expect(layoutBody).not.toContain('await');
        expect(layoutBody).toContain('<Suspense');
    });
});
