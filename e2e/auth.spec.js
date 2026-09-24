import { test, expect, loginAs } from './fixtures/test.js';
import { adminClient } from './fixtures/test-users.js';

const WRONG_PASSWORD = 'wrong-password-not-real';
const INVALID_CREDENTIALS_ERROR = 'Invalid email or password';
const LOCKOUT_ERROR = 'Too many attempts. Try again in 30 minutes.';

/**
 * Submits the login form with the given credentials, without waiting for a redirect.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} email
 * @param {string} password
 * @returns {Promise<void>}
 */
async function attemptLogin(page, email, password) {
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Log in' }).click();
}

/**
 * Deletes a test user's rate-limit row so a lockout doesn't leak into a later run -
 * not covered by deleteTestUser's own cleanup.
 *
 * @param {string} email
 * @returns {Promise<void>}
 */
async function clearRateLimit(email) {
    await adminClient().from('auth_rate_limits').delete().eq('email', email);
}

test.describe('auth', () => {
    test('valid login lands on the tasks page', async ({ page, testUser }) => {
        await loginAs(page, testUser);
        expect(new URL(page.url()).pathname).toBe('/');
    });

    test('wrong password shows a generic error and stays on the login page', async ({
        page,
        testUser,
    }) => {
        await attemptLogin(page, testUser.email, WRONG_PASSWORD);
        await expect(page.getByText(INVALID_CREDENTIALS_ERROR)).toBeVisible();
        expect(new URL(page.url()).pathname).toBe('/login');
    });

    test('a non-existent email shows the same generic error, no enumeration leak', async ({
        page,
    }) => {
        await attemptLogin(page, `e2e-no-such-user-${Date.now()}@example.com`, WRONG_PASSWORD);
        await expect(page.getByText(INVALID_CREDENTIALS_ERROR)).toBeVisible();
    });

    test('the session survives a reload', async ({ page, testUser }) => {
        await loginAs(page, testUser);
        await page.reload();
        expect(new URL(page.url()).pathname).toBe('/');
    });

    test('logging out redirects to login', async ({ page, testUser }) => {
        await loginAs(page, testUser);
        // Below the `lg` breakpoint, Log out lives inside the "Open navigation" drawer.
        const openNav = page.getByRole('button', { name: 'Open navigation' });
        if (await openNav.count()) await openNav.click();
        await page.getByRole('button', { name: 'Log out' }).click();
        await page.waitForURL('/login');
        await expect(page.getByText('Logged out')).toBeVisible();
    });

    test('visiting a protected route while logged out redirects to login', async ({ page }) => {
        await page.goto('/');
        await page.waitForURL('/login');
    });

    test('visiting login while already logged in redirects to the tasks page', async ({
        page,
        testUser,
    }) => {
        await loginAs(page, testUser);
        await page.goto('/login');
        await page.waitForURL('/');
    });

    test('locks out after 5 failed attempts', async ({ page, testUser }) => {
        // Real sequential sign-ins against live Supabase Auth can run well past a few seconds.
        test.setTimeout(180_000);
        try {
            // One navigation, not one per attempt - the form stays usable after a failure.
            await page.goto('/login');
            for (let attempt = 0; attempt < 6; attempt++) {
                await page.getByLabel('Email', { exact: true }).fill(testUser.email);
                await page.getByLabel('Password', { exact: true }).fill(WRONG_PASSWORD);
                await page.getByRole('button', { name: 'Log in' }).click();
                await expect(
                    page.getByText(attempt < 5 ? INVALID_CREDENTIALS_ERROR : LOCKOUT_ERROR),
                ).toBeVisible();
            }
        } finally {
            await clearRateLimit(testUser.email);
        }
    });

    test('a successful login clears the failed-attempt count', async ({ page, testUser }) => {
        try {
            await attemptLogin(page, testUser.email, WRONG_PASSWORD);
            await expect(page.getByText(INVALID_CREDENTIALS_ERROR)).toBeVisible();

            await loginAs(page, testUser);

            const { data: rateLimitRows } = await adminClient()
                .from('auth_rate_limits')
                .select('email')
                .eq('email', testUser.email);
            expect(rateLimitRows).toEqual([]);
        } finally {
            await clearRateLimit(testUser.email);
        }
    });
});
