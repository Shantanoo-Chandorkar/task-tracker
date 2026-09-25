import { test, expect, loginAs } from './fixtures/test.js';
import { createSpace, createList, createTask, taskRow, spaceSection } from './fixtures/app-data.js';

/**
 * Opens the tag picker and creates a new tag by name, for the task currently in view.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name - Tag name to type and create
 * @returns {Promise<void>}
 */
async function createTagViaPicker(page, name) {
    await page.getByRole('button', { name: 'Tag', exact: true }).click();
    await page.getByPlaceholder('Find or create a tag').fill(name);
    await page.getByRole('option', { name: `Create "${name}"` }).click();
}

test.describe('tags', () => {
    let listId;

    test.beforeEach(async ({ page, testUser }) => {
        await loginAs(page, testUser);
        await page.goto('/spaces');
        const spaceName = await createSpace(page);
        const listName = await createList(page, spaceName);
        await spaceSection(page, spaceName).getByRole('link', { name: listName }).click();
        await page.waitForURL(/\/lists\//);
        listId = page.url().match(/\/lists\/([^/]+)/)[1];
    });

    test('adding a tag on the task detail page shows it in the listing row', async ({ page }) => {
        const title = await createTask(page);
        await taskRow(page, title).getByRole('link', { name: title, exact: true }).click();
        await page.waitForURL(/\/tasks\//);

        await createTagViaPicker(page, 'Urgent');
        await expect(page.getByText('Urgent', { exact: true })).toBeVisible();

        await page.goto(`/lists/${listId}`);
        await expect(taskRow(page, title).getByText('Urgent', { exact: true })).toBeVisible();
    });

    test('a second tag collapses the row into an "N tags" pill with a read-only dialog', async ({
        page,
    }) => {
        const title = await createTask(page);
        await taskRow(page, title).getByRole('link', { name: title, exact: true }).click();
        await page.waitForURL(/\/tasks\//);

        await createTagViaPicker(page, 'Urgent');
        await expect(page.getByText('Urgent', { exact: true })).toBeVisible();
        await createTagViaPicker(page, 'Blocked');
        await expect(page.getByText('Blocked', { exact: true })).toBeVisible();

        await page.goto(`/lists/${listId}`);
        const row = taskRow(page, title);
        const summaryButton = row.getByRole('button', { name: '2 tags' });
        await expect(summaryButton).toBeVisible();

        await summaryButton.click();
        const dialog = page.getByRole('dialog', { name: 'Tags' });
        await expect(dialog.getByText('Urgent', { exact: true })).toBeVisible();
        await expect(dialog.getByText('Blocked', { exact: true })).toBeVisible();
    });

    test('reusing a tag name (any case) attaches the same tag, not a duplicate', async ({
        page,
    }) => {
        const firstTitle = await createTask(page);
        const secondTitle = await createTask(page);

        await taskRow(page, firstTitle)
            .getByRole('link', { name: firstTitle, exact: true })
            .click();
        await page.waitForURL(/\/tasks\//);
        await createTagViaPicker(page, 'urgent');
        await expect(page.getByText('urgent', { exact: true })).toBeVisible();

        await page.goto(`/lists/${listId}`);
        await taskRow(page, secondTitle)
            .getByRole('link', { name: secondTitle, exact: true })
            .click();
        await page.waitForURL(/\/tasks\//);

        await page.getByRole('button', { name: 'Tag', exact: true }).click();
        await page.getByPlaceholder('Find or create a tag').fill('Urgent');
        // A case-insensitive match already exists - the picker offers it, not a second "Create" option.
        await expect(page.getByRole('option', { name: 'Create "Urgent"' })).toHaveCount(0);
        await page.getByRole('option', { name: 'urgent', exact: true }).click();
        await expect(page.getByText('urgent', { exact: true })).toBeVisible();
    });

    test('removing a tag from the task detail page removes it', async ({ page }) => {
        const title = await createTask(page);
        await taskRow(page, title).getByRole('link', { name: title, exact: true }).click();
        await page.waitForURL(/\/tasks\//);

        await createTagViaPicker(page, 'Urgent');
        await expect(page.getByText('Urgent', { exact: true })).toBeVisible();

        await page.getByRole('button', { name: 'Remove tag Urgent' }).click();
        await expect(page.getByText('Urgent', { exact: true })).toHaveCount(0);
    });

    test('tags do not appear on the Home screen', async ({ page }) => {
        const title = await createTask(page);
        await taskRow(page, title).getByRole('link', { name: title, exact: true }).click();
        await page.waitForURL(/\/tasks\//);
        await createTagViaPicker(page, 'Urgent');

        await page.goto('/');
        await expect(page.getByText('Urgent', { exact: true })).toHaveCount(0);
    });
});
