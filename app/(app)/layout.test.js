import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// layout.js and AppShell.jsx have JSX, which the test transform skips, so the guard reads source instead
const layoutSource = readFileSync(resolve(__dirname, 'layout.js'), 'utf8');
const shellSource = readFileSync(resolve(__dirname, '../../components/nav/AppShell.jsx'), 'utf8');

describe('app layout', () => {
    it('is a thin wrapper around the shared, zone-agnostic AppShell', () => {
        expect(layoutSource).toMatch(/export default function AppLayout\(/);
        expect(layoutSource).not.toMatch(/export default async function/);
        expect(layoutSource).toContain('<AppShell>{children}</AppShell>');
    });
});

describe('AppShell', () => {
    it('is not async, so the frame and skeletons can stream before any data has loaded', () => {
        expect(shellSource).toMatch(/export default function AppShell\(/);
        expect(shellSource).not.toMatch(/export default async function/);
    });

    it('starts with a skip link that targets the main landmark', () => {
        expect(shellSource).toMatch(/<a\s+href="#main-content"/);
        expect(shellSource).toMatch(/<main\s+id="main-content"\s+tabIndex=\{-1\}/);
        expect(shellSource.indexOf('href="#main-content"')).toBeLessThan(
            shellSource.indexOf('<AuthKeepAlive'),
        );
    });

    it('awaits data only inside the small per-piece components under Suspense', () => {
        const shellBody = shellSource.slice(
            shellSource.indexOf('export default function AppShell'),
        );

        expect(shellBody).not.toContain('await');
        expect(shellBody).toContain('<Suspense');
    });
});

describe('layouts without the app chrome', () => {
    it.each([
        ['auth', '../(auth)/layout.js'],
        ['invites', '../invites/layout.js'],
    ])('the %s layout wraps its card in a main landmark', (_name, relativePath) => {
        const source = readFileSync(resolve(__dirname, relativePath), 'utf8');

        expect(source).toContain('<main');
        expect(source).toContain('</main>');
    });
});
