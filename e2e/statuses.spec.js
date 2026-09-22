import { test, expect, loginAs } from './fixtures/test.js';
import { uniqueName, createSpace, createStatus, spaceSection, statusRow } from './fixtures/app-data.js';

test.describe('statuses', () => {
    let spaceName;

    test.beforeEach(async ({ page, testUser }) => {
        await loginAs(page, testUser);
        await page.goto('/spaces');
        spaceName = await createSpace(page);
        await spaceSection(page, spaceName).getByRole('button', { name: 'Statuses' }).click();
    });

    test('creating a status shows it in the space', async ({ page }) => {
        const statusName = await createStatus(page, spaceName);
        await expect(statusRow(page, spaceName, statusName)).toBeVisible();
    });

    test('editing a status renames it', async ({ page }) => {
        const statusName = await createStatus(page, spaceName);
        const newName = uniqueName('Renamed status');

        await statusRow(page, spaceName, statusName).getByRole('button', { name: 'Edit status' }).click();
        await page.getByRole('dialog').getByPlaceholder('Status name').fill(newName);
        await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
        await expect(page.getByRole('dialog')).toBeHidden();

        await expect(statusRow(page, spaceName, newName)).toBeVisible();
        await expect(statusRow(page, spaceName, statusName)).toHaveCount(0);
    });

    test('a status created in one space does not appear in another', async ({ page }) => {
        const otherSpaceName = await createSpace(page);
        const statusName = await createStatus(page, spaceName);

        // Expand the other space's panel too, or absence would trivially pass without proving isolation.
        await spaceSection(page, otherSpaceName).getByRole('button', { name: 'Statuses' }).click();

        await expect(statusRow(page, spaceName, statusName)).toBeVisible();
        await expect(spaceSection(page, otherSpaceName).getByText(statusName)).toHaveCount(0);
    });

    // name-too-long test dropped: maxLength truncates fill(), unreachable via UI - see docs/e2e-test-quality.md.

    // All 3 seeded statuses are built-in/undeletable, so isOnly is unreachable via UI - not tested here.
    test('the default status cannot be deleted', async ({ page }) => {
        // Disabled, so its title (and accessible name) is the reason, not "Delete status".
        const deleteButton = statusRow(page, spaceName, 'To Do').getByRole('button', {
            name: 'Cannot delete the default status',
        });
        await expect(deleteButton).toBeDisabled();
    });

    test('a built-in, non-default status cannot be deleted', async ({ page }) => {
        const deleteButton = statusRow(page, spaceName, 'In Progress').getByRole('button', {
            name: 'Built-in status - can’t be deleted',
        });
        await expect(deleteButton).toBeDisabled();
    });
});
