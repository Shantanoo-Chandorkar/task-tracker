import { test, expect, loginAs } from './fixtures/test.js';
import {
    createSpace,
    createList,
    createSublist,
    createTask,
    spaceSection,
    listRow,
    sublistRow,
    taskRow,
    dragHandleDown,
} from './fixtures/app-data.js';

/**
 * Asserts one row sits visually below another, retrying until layout settles.
 *
 * @param {import('@playwright/test').Locator} lowerRow - Expected to be below `upperRow`.
 * @param {import('@playwright/test').Locator} upperRow
 * @returns {Promise<void>}
 */
async function expectRowBelow(lowerRow, upperRow) {
    await expect(async () => {
        const [lowerBox, upperBox] = await Promise.all([
            lowerRow.boundingBox(),
            upperRow.boundingBox(),
        ]);
        expect(lowerBox.y).toBeGreaterThan(upperBox.y);
    }).toPass();
}

test.describe('drag-and-drop reorder', () => {
    test.beforeEach(async ({ page, testUser }) => {
        await loginAs(page, testUser);
    });

    test('reordering spaces persists after reload', async ({ page }) => {
        await page.goto('/spaces');
        const firstSpaceName = await createSpace(page);
        const secondSpaceName = await createSpace(page);

        await dragHandleDown(spaceSection(page, firstSpaceName));
        await expectRowBelow(
            spaceSection(page, firstSpaceName),
            spaceSection(page, secondSpaceName),
        );
        // The reorder is only optimistic until this toast confirms the position actually saved.
        await expect(page.getByText('Order saved')).toBeVisible();

        await page.reload();
        await expectRowBelow(
            spaceSection(page, firstSpaceName),
            spaceSection(page, secondSpaceName),
        );
    });

    test('reordering lists within a space persists after reload', async ({ page }) => {
        await page.goto('/spaces');
        const spaceName = await createSpace(page);
        const firstListName = await createList(page, spaceName);
        const secondListName = await createList(page, spaceName);

        await dragHandleDown(listRow(page, spaceName, firstListName));
        await expectRowBelow(
            listRow(page, spaceName, firstListName),
            listRow(page, spaceName, secondListName),
        );
        await expect(page.getByText('Order saved')).toBeVisible();

        await page.reload();
        await expectRowBelow(
            listRow(page, spaceName, firstListName),
            listRow(page, spaceName, secondListName),
        );
    });

    test('reordering sublists within a list persists after reload', async ({ page }) => {
        await page.goto('/spaces');
        const spaceName = await createSpace(page);
        const listName = await createList(page, spaceName);
        await spaceSection(page, spaceName).getByRole('link', { name: listName }).click();
        await page.waitForURL(/\/lists\//);

        const firstSublistName = await createSublist(page, spaceName, listName);
        const secondSublistName = await createSublist(page, spaceName, listName);

        await dragHandleDown(sublistRow(page, firstSublistName));
        await expectRowBelow(
            sublistRow(page, firstSublistName),
            sublistRow(page, secondSublistName),
        );
        await expect(page.getByText('Order updated')).toBeVisible();

        await page.reload();
        await expectRowBelow(
            sublistRow(page, firstSublistName),
            sublistRow(page, secondSublistName),
        );
    });

    test('reordering tasks in the same status bucket persists after reload', async ({ page }) => {
        await page.goto('/spaces');
        const spaceName = await createSpace(page);
        const listName = await createList(page, spaceName);
        await spaceSection(page, spaceName).getByRole('link', { name: listName }).click();
        await page.waitForURL(/\/lists\//);

        const firstTaskTitle = await createTask(page);
        const secondTaskTitle = await createTask(page);

        await dragHandleDown(taskRow(page, firstTaskTitle));
        await expectRowBelow(taskRow(page, firstTaskTitle), taskRow(page, secondTaskTitle));
        await expect(page.getByText('Order updated')).toBeVisible();

        await page.reload();
        await expectRowBelow(taskRow(page, firstTaskTitle), taskRow(page, secondTaskTitle));
    });
});
