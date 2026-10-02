import { test, expect, loginAs } from './fixtures/test.js';
import {
    uniqueName,
    createSpace,
    createStatus,
    openStatusSettings,
    statusFormDialog,
    statusRow,
} from './fixtures/app-data.js';

test.describe('statuses', () => {
    let spaceName;

    test.beforeEach(async ({ page, testUser }) => {
        await loginAs(page, testUser);
        await page.goto('/spaces');
        spaceName = await createSpace(page);
    });

    test('creating a status shows it in the space', async ({ page }) => {
        const sheet = await openStatusSettings(page, spaceName);
        const statusName = await createStatus(page, sheet);
        await expect(statusRow(sheet, statusName)).toBeVisible();
    });

    test('editing a status renames it', async ({ page }) => {
        const sheet = await openStatusSettings(page, spaceName);
        const statusName = await createStatus(page, sheet);
        const newName = uniqueName('Renamed status');

        await statusRow(sheet, statusName)
            .getByRole('button', { name: `More actions for ${statusName}`, exact: true })
            .click();
        await page.getByRole('menuitem', { name: 'Edit' }).click();
        const form = statusFormDialog(page);
        await form.getByPlaceholder('Status name').fill(newName);
        await form.getByRole('button', { name: 'Save changes' }).click();
        await expect(form).toBeHidden();

        await expect(statusRow(sheet, newName)).toBeVisible();
        await expect(statusRow(sheet, statusName)).toHaveCount(0);
    });

    test('a status created in one space does not appear in another', async ({ page }) => {
        const otherSpaceName = await createSpace(page);
        const sheet = await openStatusSettings(page, spaceName);
        const statusName = await createStatus(page, sheet);
        await expect(statusRow(sheet, statusName)).toBeVisible();

        await page.keyboard.press('Escape');
        await expect(sheet).toBeHidden();

        // Wait for the other space's own list to load first, or absence would trivially pass without proving isolation.
        const otherSheet = await openStatusSettings(page, otherSpaceName);
        await expect(statusRow(otherSheet, 'To Do')).toBeVisible();
        await expect(statusRow(otherSheet, statusName)).toHaveCount(0);
    });

    // name-too-long test dropped: maxLength truncates fill(), unreachable via UI - see docs/e2e-test-quality.md.

    // All 3 seeded statuses are built-in/undeletable, so isOnly is unreachable via UI - not tested here.
    test('the default status cannot be deleted', async ({ page }) => {
        const sheet = await openStatusSettings(page, spaceName);
        // A disabled menu item shows the reason as its own text, instead of "Delete".
        await statusRow(sheet, 'To Do')
            .getByRole('button', { name: 'More actions for To Do', exact: true })
            .click();
        const deleteItem = page.getByRole('menuitem', {
            name: 'Cannot delete the default status',
        });
        await expect(deleteItem).toHaveAttribute('aria-disabled', 'true');
    });

    test('a built-in, non-default status cannot be deleted', async ({ page }) => {
        const sheet = await openStatusSettings(page, spaceName);
        await statusRow(sheet, 'In Progress')
            .getByRole('button', { name: 'More actions for In Progress', exact: true })
            .click();
        const deleteItem = page.getByRole('menuitem', {
            name: 'Built-in status - can’t be deleted',
        });
        await expect(deleteItem).toHaveAttribute('aria-disabled', 'true');
    });
});
