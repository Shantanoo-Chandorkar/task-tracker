import { test, expect, loginAs } from './fixtures/test.js';

test.describe('harness smoke test', () => {
    test('an unauthenticated visitor is redirected to /login', async ({ page }) => {
        await page.goto('/');
        await page.waitForURL('/login');
        await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
    });

    test('a fresh test user can log in and reach the app', async ({ page, testUser }) => {
        await loginAs(page, testUser);
        await expect(page.getByRole('heading', { name: 'Welcome to Task Tracker' })).toBeVisible();
    });
});
