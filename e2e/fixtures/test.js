import { test as base, expect } from '@playwright/test';
import { createTestUser, deleteTestUser } from './test-users.js';

/**
 * Logs a fixture-created user in through the real login form.
 *
 * No test-only backdoor - this exercises the exact path a real user takes.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{email: string, password: string}} user
 * @returns {Promise<void>}
 */
export async function loginAs(page, user) {
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(user.email);
    // Unqualified, this also substring-matches the "Show password" toggle button's aria-label.
    await page.getByLabel('Password', { exact: true }).fill(user.password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.waitForURL('/');
}

/**
 * Extends the base test with a `testUser` fixture - throwaway account created and torn down around each test.
 * Also hides Next's dev-tools badge, whose position is saved in .next and can cover app buttons.
 */
export const test = base.extend({
    context: async ({ context }, use) => {
        await context.addInitScript(() => {
            const hideDevToolsOverlay = () => {
                const style = document.createElement('style');
                style.textContent = 'nextjs-portal { display: none !important; }';
                document.documentElement.appendChild(style);
            };
            if (document.documentElement) hideDevToolsOverlay();
            else document.addEventListener('DOMContentLoaded', hideDevToolsOverlay, { once: true });
        });
        await use(context);
    },
    testUser: async ({}, use) => {
        const user = await createTestUser();
        await use(user);
        await deleteTestUser(user.id);
    },
});

export { expect };
