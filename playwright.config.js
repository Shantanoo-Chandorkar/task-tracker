import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// .env.test is git-ignored (mirrors .env.local); CI sets these vars directly instead.
if (existsSync('.env.test')) process.loadEnvFile('.env.test');

// Dedicated test-only port (never 3000, the user's real npm run dev) - killed after every run.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3001';

// CJS (no "type": "module") can't require() a real .mjs file - install runs via pretest:e2e.
const mailpitBinaryPath = join(process.cwd(), '.tools', 'mailpit', process.platform === 'win32' ? 'mailpit.exe' : 'mailpit');

export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    // High parallelism vs one shared dev server + real Supabase causes contention - see docs/e2e-test-quality.md.
    workers: process.env.CI ? 2 : 3,
    // Real dev-server/network calls exceed Playwright's 5s/30s defaults - see docs/e2e-test-quality.md.
    timeout: 60_000,
    expect: { timeout: 15_000 },
    forbidOnly: Boolean(process.env.CI),
    // Backstop kill of the port-3001 server and Mailpit - see docs/e2e-test-quality.md.
    globalTeardown: './e2e/global-teardown.js',
    // failures.md lands under test-results/runs/<timestamp>/ - read it back, no screenshots.
    reporter: [['list'], ['html'], ['./e2e/reporters/failure-log-reporter.js']],
    use: {
        baseURL,
        trace: 'on-first-retry',
    },
    // Mobile-first (CLAUDE.md): every spec defaults to a phone viewport, desktop is secondary.
    projects: [
        { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
        { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
    ],
    webServer: [
        {
            // BREVO_SMTP_* from .env.test points here instead of real Brevo, for testable email flows.
            command: 'npm run dev -- -p 3001',
            url: baseURL,
            // Always fresh - reuse ignores .env.test edits until killed - see docs/e2e-test-quality.md.
            reuseExistingServer: false,
            timeout: 120_000,
        },
        {
            // Ports 2525/2526, not Mailpit's own defaults - those collide with other local dev
            // tools running Mailpit (e.g. WP Engine's Local) on this machine - see docs/e2e-test-quality.md.
            command: `"${mailpitBinaryPath}" --smtp 127.0.0.1:2525 --listen 127.0.0.1:2526`,
            url: 'http://127.0.0.1:2526/',
            reuseExistingServer: false,
            timeout: 30_000,
        },
    ],
});
