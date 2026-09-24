import { test, expect, loginAs } from './fixtures/test.js';
import { adminClient, createTestUser, deleteTestUser } from './fixtures/test-users.js';
import { uniqueName, createSpace, createList, spaceSection } from './fixtures/app-data.js';

test.describe('spaces', () => {
    test.beforeEach(async ({ page, testUser }) => {
        await loginAs(page, testUser);
        await page.goto('/spaces');
    });

    test('creating a space shows it in the list', async ({ page }) => {
        const spaceName = await createSpace(page);
        await expect(page.getByText(spaceName)).toBeVisible();
    });

    test('editing a space renames it', async ({ page }) => {
        const spaceName = await createSpace(page);
        const newName = uniqueName('Renamed space');

        await spaceSection(page, spaceName).getByRole('button', { name: 'Edit space' }).click();
        await page.getByRole('dialog').getByPlaceholder('Space name').fill(newName);
        await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
        await expect(page.getByRole('dialog')).toBeHidden();

        await expect(page.getByText(newName)).toBeVisible();
        await expect(page.getByText(spaceName)).toHaveCount(0);
    });

    test('deleting a space shows the cascade count and removes it and its lists', async ({
        page,
    }) => {
        const spaceName = await createSpace(page);
        const listName = await createList(page, spaceName);

        await spaceSection(page, spaceName).getByRole('button', { name: 'Delete space' }).click();
        await expect(
            page.getByText('This deletes 1 list and 0 tasks. This cannot be undone.'),
        ).toBeVisible();
        await page.getByRole('button', { name: 'Delete' }).click();

        await expect(page.getByText('Space deleted')).toBeVisible();
        await expect(page.getByText(spaceName)).toHaveCount(0);
        await expect(page.getByText(listName)).toHaveCount(0);
    });

    // name-too-long test dropped: maxLength truncates fill(), unreachable via UI - see docs/e2e-test-quality.md.

    test('requesting to join a space with an invalid ID shows an inline error', async ({
        page,
    }) => {
        await page.getByRole('button', { name: 'Join a space' }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByPlaceholder('Paste the space ID').fill('not-a-uuid');
        await dialog.getByRole('button', { name: 'Request to join' }).click();

        await expect(dialog.getByText('Enter a valid space ID')).toBeVisible();
        await expect(dialog).toBeVisible();
    });

    test('a second account cannot fetch a space it does not own', async ({ page, browser }) => {
        const spaceName = await createSpace(page);
        const { data: space } = await adminClient()
            .from('spaces')
            .select('id')
            .eq('name', spaceName)
            .single();

        const otherUser = await createTestUser();
        try {
            const otherContext = await browser.newContext();
            const otherPage = await otherContext.newPage();
            await loginAs(otherPage, otherUser);

            const response = await otherPage.request.get(`/api/spaces/${space.id}`);
            expect(response.status()).toBe(404);
            expect(await response.json()).toEqual({ error: 'Space not found' });

            await otherContext.close();
        } finally {
            await deleteTestUser(otherUser.id);
        }
    });
});
