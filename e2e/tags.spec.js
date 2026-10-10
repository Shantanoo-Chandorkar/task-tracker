import { test, expect, loginAs } from './fixtures/test.js';
import {
    createSpace,
    createList,
    createTask,
    createTag,
    openTagSettings,
    statusRow,
    tagFormDialog,
    taskRow,
    spaceSection,
} from './fixtures/app-data.js';

/**
 * Picks an existing tag on the task currently in view, through the tag picker.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name - Name of a tag that already exists in the space
 * @returns {Promise<void>}
 */
async function pickTag(page, name) {
    await page.getByRole('button', { name: 'Tag', exact: true }).click();
    await page.getByRole('option', { name, exact: true }).click();
    // Two quick picks race the first one's reload, so wait for its pill (docs/e2e-test-quality.md #2)
    await expect(page.locator('[data-slot="badge"]', { hasText: name })).toBeVisible();
}

test.describe('tags', () => {
    let spaceName;
    let listId;

    /**
     * Creates tags in the space's settings sheet, then returns to the list.
     *
     * @param {import('@playwright/test').Page} page
     * @param {string[]} names - Tags to create, in order
     * @returns {Promise<void>}
     */
    async function createTagsInSettings(page, names) {
        await page.goto('/spaces');
        const sheet = await openTagSettings(page, spaceName);
        for (const name of names) await createTag(page, sheet, name);
        await page.goto(`/lists/${listId}`);
    }

    test.beforeEach(async ({ page, testUser }) => {
        await loginAs(page, testUser);
        await page.goto('/spaces');
        spaceName = await createSpace(page);
        const listName = await createList(page, spaceName);
        await spaceSection(page, spaceName).getByRole('link', { name: listName }).click();
        await page.waitForURL(/\/lists\//);
        listId = page.url().match(/\/lists\/([^/]+)/)[1];
    });

    test('a tag made in the space settings can be picked on a task and shows in its row', async ({
        page,
    }) => {
        await createTagsInSettings(page, ['Urgent']);
        const title = await createTask(page);
        await taskRow(page, title).getByRole('link', { name: title, exact: true }).click();
        await page.waitForURL(/\/tasks\//);

        await pickTag(page, 'Urgent');

        await page.goto(`/lists/${listId}`);
        await expect(taskRow(page, title).getByText('Urgent', { exact: true })).toBeVisible();
    });

    test('a second tag collapses the row into an "N tags" pill with a read-only dialog', async ({
        page,
    }) => {
        await createTagsInSettings(page, ['Urgent', 'Blocked']);
        const title = await createTask(page);
        await taskRow(page, title).getByRole('link', { name: title, exact: true }).click();
        await page.waitForURL(/\/tasks\//);

        await pickTag(page, 'Urgent');
        await pickTag(page, 'Blocked');

        await page.goto(`/lists/${listId}`);
        const summaryButton = taskRow(page, title).getByRole('button', { name: '2 tags' });
        await expect(summaryButton).toBeVisible();

        await summaryButton.click();
        const dialog = page.getByRole('dialog', { name: 'Tags' });
        await expect(dialog.getByText('Urgent', { exact: true })).toBeVisible();
        await expect(dialog.getByText('Blocked', { exact: true })).toBeVisible();
    });

    test('the picker only lists existing tags and points to the settings when there are none', async ({
        page,
    }) => {
        const title = await createTask(page);
        await taskRow(page, title).getByRole('link', { name: title, exact: true }).click();
        await page.waitForURL(/\/tasks\//);

        await page.getByRole('button', { name: 'Tag', exact: true }).click();

        await expect(page.getByText('No tags yet. Add them in the space settings.')).toBeVisible();
        await page.getByPlaceholder('Find a tag').fill('Brand new');
        await expect(page.getByRole('option', { name: /Create/ })).toHaveCount(0);
    });

    test('a tag name cannot be used twice in a space, in any case', async ({ page }) => {
        await page.goto('/spaces');
        const sheet = await openTagSettings(page, spaceName);
        await createTag(page, sheet, 'Urgent');

        await sheet.getByRole('button', { name: '+ Add tag' }).click();
        const form = tagFormDialog(page);
        await form.getByPlaceholder('Tag name').fill('urgent');
        await form.getByRole('button', { name: 'Create tag' }).click();

        await expect(form.getByText('A tag with that name already exists')).toBeVisible();
    });

    test('renaming a tag in the settings renames it on the tasks that use it', async ({ page }) => {
        await createTagsInSettings(page, ['Urgent']);
        const title = await createTask(page);
        await taskRow(page, title).getByRole('link', { name: title, exact: true }).click();
        await page.waitForURL(/\/tasks\//);
        await pickTag(page, 'Urgent');

        await page.goto('/spaces');
        const sheet = await openTagSettings(page, spaceName);
        await statusRow(sheet, 'Urgent')
            .getByRole('button', { name: /More actions for/ })
            .click();
        await page.getByRole('menuitem', { name: 'Edit' }).click();
        const form = tagFormDialog(page);
        await form.getByPlaceholder('Tag name').fill('Critical');
        await form.getByRole('button', { name: 'Save changes' }).click();
        await expect(form).toBeHidden();

        await page.goto(`/lists/${listId}`);
        await expect(taskRow(page, title).getByText('Critical', { exact: true })).toBeVisible();
    });

    test('deleting a tag in the settings removes it from the tasks that use it', async ({
        page,
    }) => {
        await createTagsInSettings(page, ['Urgent']);
        const title = await createTask(page);
        await taskRow(page, title).getByRole('link', { name: title, exact: true }).click();
        await page.waitForURL(/\/tasks\//);
        await pickTag(page, 'Urgent');

        await page.goto('/spaces');
        const sheet = await openTagSettings(page, spaceName);
        await statusRow(sheet, 'Urgent')
            .getByRole('button', { name: /More actions for/ })
            .click();
        await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
        await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
        await expect(statusRow(sheet, 'Urgent')).toHaveCount(0);

        await page.goto(`/lists/${listId}`);
        await expect(taskRow(page, title).getByText('Urgent', { exact: true })).toHaveCount(0);
    });

    test('removing a tag from the task detail page removes it', async ({ page }) => {
        await createTagsInSettings(page, ['Urgent']);
        const title = await createTask(page);
        await taskRow(page, title).getByRole('link', { name: title, exact: true }).click();
        await page.waitForURL(/\/tasks\//);
        await pickTag(page, 'Urgent');

        await page.getByRole('button', { name: 'Remove tag Urgent' }).click();

        await expect(page.getByRole('button', { name: 'Remove tag Urgent' })).toHaveCount(0);
    });

    test('tags do not appear on the Home screen', async ({ page }) => {
        await createTagsInSettings(page, ['Urgent']);
        const title = await createTask(page);
        await taskRow(page, title).getByRole('link', { name: title, exact: true }).click();
        await page.waitForURL(/\/tasks\//);
        await pickTag(page, 'Urgent');

        await page.goto('/');
        await expect(page.getByText('Urgent', { exact: true })).toHaveCount(0);
    });

    // The 10-tags-per-task limit needs 11 creates here, so unit tests cover it instead
});
