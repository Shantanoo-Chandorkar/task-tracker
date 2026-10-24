import { test, expect, loginAs } from './fixtures/test.js';
import {
    createSpace,
    createList,
    createTask,
    createTag,
    openTagSettings,
    spaceSection,
} from './fixtures/app-data.js';

test.describe('task filter chips', () => {
    let spaceName;
    let listId;

    test.beforeEach(async ({ page, testUser }) => {
        await loginAs(page, testUser);
        await page.goto('/spaces');
        spaceName = await createSpace(page);
        const listName = await createList(page, spaceName);
        await spaceSection(page, spaceName).getByRole('link', { name: listName }).click();
        await page.waitForURL(/\/lists\//);
        listId = page.url().match(/\/lists\/([^/]+)/)[1];
        await createTask(page);
    });

    test('the tag chip shows the real name immediately, even when /api/tags is slow', async ({
        page,
    }) => {
        await page.goto('/spaces');
        const sheet = await openTagSettings(page, spaceName);
        await createTag(page, sheet, 'Urgent');
        await page.goto(`/lists/${listId}`);

        const filterSheet = page.getByRole('dialog', { name: 'Filters' });
        await page.getByRole('button', { name: 'Filters', exact: true }).click();
        await filterSheet.getByRole('button', { name: 'Tags', exact: true }).click();
        await filterSheet.getByRole('checkbox', { name: 'Urgent' }).click();
        await filterSheet.getByRole('button', { name: /Apply/ }).click();
        await expect(filterSheet).toBeHidden();
        await expect(page.getByText('Urgent', { exact: true })).toBeVisible();

        // Delayed past the assertion's own timeout below, so a quick-resolving chip can only mean SSR already had it.
        await page.route('**/api/tags*', async (route) => {
            await new Promise((resolve) => setTimeout(resolve, 4000));
            await route.continue();
        });

        await page.reload();
        await expect(page.getByText('Urgent', { exact: true }).first()).toBeVisible({
            timeout: 1000,
        });
    });

    test('the "Created by" chip shows the owner\'s name immediately, never "Owner", even when /api/space-collaborators is slow', async ({
        page,
        testUser,
    }) => {
        const filterSheet = page.getByRole('dialog', { name: 'Filters' });
        await page.getByRole('button', { name: 'Filters', exact: true }).click();
        await filterSheet.getByRole('button', { name: 'Created by', exact: true }).click();
        await filterSheet.getByRole('checkbox', { name: testUser.email }).click();
        await filterSheet.getByRole('button', { name: /Apply/ }).click();
        await expect(filterSheet).toBeHidden();
        await expect(page.getByText(testUser.email, { exact: false }).first()).toBeVisible();

        await page.route('**/api/space-collaborators*', async (route) => {
            await new Promise((resolve) => setTimeout(resolve, 4000));
            await route.continue();
        });

        await page.reload();
        await expect(page.getByText(testUser.email, { exact: false }).first()).toBeVisible({
            timeout: 1000,
        });
        await expect(page.getByText('Owner', { exact: true })).toHaveCount(0);
    });
});
