import { test, expect, loginAs } from './fixtures/test.js';
import { uniqueName, createSpace, createList, spaceSection, listRow } from './fixtures/app-data.js';

test.describe('lists', () => {
    let spaceName;

    test.beforeEach(async ({ page, testUser }) => {
        await loginAs(page, testUser);
        await page.goto('/spaces');
        spaceName = await createSpace(page);
    });

    test('creating a list shows it under its space', async ({ page }) => {
        const listName = await createList(page, spaceName);
        await expect(
            spaceSection(page, spaceName).getByRole('link', { name: listName }),
        ).toBeVisible();
    });

    test('editing a list renames it', async ({ page }) => {
        const listName = await createList(page, spaceName);
        const newName = uniqueName('Renamed list');

        await listRow(page, spaceName, listName).getByRole('button', { name: 'Edit list' }).click();
        await page.getByRole('dialog').getByPlaceholder('List name').fill(newName);
        await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
        await expect(page.getByRole('dialog')).toBeHidden();

        await expect(
            spaceSection(page, spaceName).getByRole('link', { name: newName }),
        ).toBeVisible();
        await expect(
            spaceSection(page, spaceName).getByRole('link', { name: listName }),
        ).toHaveCount(0);
    });

    test('deleting a list shows the cascade count and removes it', async ({ page }) => {
        const listName = await createList(page, spaceName);

        await listRow(page, spaceName, listName)
            .getByRole('button', { name: 'Delete list' })
            .click();
        await expect(page.getByText('This deletes 0 tasks. This cannot be undone.')).toBeVisible();
        await page.getByRole('button', { name: 'Delete' }).click();

        await expect(page.getByText('List deleted')).toBeVisible();
        await expect(
            spaceSection(page, spaceName).getByRole('link', { name: listName }),
        ).toHaveCount(0);
    });

    // name-too-long test dropped: maxLength truncates fill(), unreachable via UI - see docs/e2e-test-quality.md.
});
