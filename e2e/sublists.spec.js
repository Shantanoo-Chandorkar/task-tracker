import { test, expect, loginAs } from './fixtures/test.js';
import { uniqueName, createSpace, createList, createSublist, spaceSection } from './fixtures/app-data.js';

test.describe('sublists', () => {
    let spaceName;
    let listName;

    test.beforeEach(async ({ page, testUser }) => {
        await loginAs(page, testUser);
        await page.goto('/spaces');
        spaceName = await createSpace(page);
        listName = await createList(page, spaceName);
        await spaceSection(page, spaceName).getByRole('link', { name: listName }).click();
        await page.waitForURL(/\/lists\//);
    });

    test('creating a sublist shows it in the list', async ({ page }) => {
        const sublistName = await createSublist(page, spaceName, listName);
        await expect(page.getByText(sublistName, { exact: false })).toBeVisible();
    });

    test('editing a sublist renames it', async ({ page }) => {
        const sublistName = await createSublist(page, spaceName, listName);
        const newName = uniqueName('Renamed sublist');

        await page.getByRole('button', { name: 'Sublist actions' }).click();
        await page.getByRole('menuitem', { name: 'Edit' }).click();
        await page.getByRole('dialog').getByPlaceholder('Sublist name').fill(newName);
        await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
        await expect(page.getByRole('dialog')).toBeHidden();

        await expect(page.getByText(newName, { exact: false })).toBeVisible();
        await expect(page.getByText(sublistName, { exact: false })).toHaveCount(0);
    });

    test('deleting a sublist shows the cascade count and removes it', async ({ page }) => {
        const sublistName = await createSublist(page, spaceName, listName);

        await page.getByRole('button', { name: 'Sublist actions' }).click();
        await page.getByRole('menuitem', { name: 'Delete' }).click();
        await expect(page.getByText('Delete “' + sublistName + '”?')).toBeVisible();
        await expect(page.getByText('This deletes 0 tasks inside it. This cannot be undone.')).toBeVisible();
        await page.getByRole('button', { name: 'Delete' }).click();

        await expect(page.getByText('Sublist deleted')).toBeVisible();
        await expect(page.getByText(sublistName, { exact: false })).toHaveCount(0);
    });

    // name-too-long test dropped: maxLength truncates fill(), unreachable via UI - see docs/e2e-test-quality.md.
});
