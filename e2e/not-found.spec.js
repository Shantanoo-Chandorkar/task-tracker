import { test, expect, loginAs } from './fixtures/test.js';

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

test.describe('not-found pages', () => {
    test('a logged-out visitor on an unknown URL is still sent to /login', async ({ page }) => {
        await page.goto('/this-page-does-not-exist');
        await page.waitForURL('/login');
    });

    test('a logged-in user on an unknown URL sees the not-found page', async ({
        page,
        testUser,
    }) => {
        await loginAs(page, testUser);
        await page.goto('/this-page-does-not-exist');

        await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
        await page.getByRole('link', { name: 'Go to Home' }).click();
        await page.waitForURL('/');
    });

    test('a list that does not exist shows not-found inside the app shell', async ({
        page,
        testUser,
    }) => {
        await loginAs(page, testUser);
        await page.goto(`/lists/${MISSING_ID}`);

        // <main> only exists in the (app) layout, so it proves the nav shell was kept.
        await expect(
            page.getByRole('main').getByRole('heading', { name: 'Page not found' }),
        ).toBeVisible();
    });

    test('a task that does not exist shows not-found inside the app shell', async ({
        page,
        testUser,
    }) => {
        await loginAs(page, testUser);
        await page.goto(`/lists/${MISSING_ID}/tasks/${MISSING_ID}`);

        await expect(
            page.getByRole('main').getByRole('heading', { name: 'Page not found' }),
        ).toBeVisible();
    });

    test('a malformed list or task id shows not-found, not the error page', async ({
        page,
        testUser,
    }) => {
        await loginAs(page, testUser);

        for (const malformedPath of ['/lists/not-a-uuid', '/lists/not-a-uuid/tasks/also-bad']) {
            await page.goto(malformedPath);
            await expect(
                page.getByRole('main').getByRole('heading', { name: 'Page not found' }),
            ).toBeVisible();
            await expect(page.getByText('Something went wrong')).toHaveCount(0);
        }
    });
});
