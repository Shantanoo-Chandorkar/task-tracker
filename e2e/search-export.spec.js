import { test, expect, loginAs } from './fixtures/test.js';
import { adminClient, createTestUser, deleteTestUser } from './fixtures/test-users.js';
import {
    uniqueName,
    createSpace,
    createList,
    createSublist,
    createTask,
    spaceSection,
} from './fixtures/app-data.js';

test.describe('search and export', () => {
    test('search finds tasks, lists, and spaces, and navigates on select', async ({
        page,
        testUser,
    }) => {
        await loginAs(page, testUser);
        await page.goto('/spaces');
        const marker = uniqueName('Findme');
        const spaceName = await createSpace(page, `${marker} Space`);
        const listName = await createList(page, spaceName, `${marker} List`);
        await spaceSection(page, spaceName).getByRole('link', { name: listName }).click();
        await page.waitForURL(/\/lists\//);
        const listId = page.url().match(/\/lists\/([^/]+)/)[1];
        const taskTitle = await createTask(page, { title: `${marker} Task` });

        // Control+K works on both projects - the visible trigger button differs by viewport.
        await page.keyboard.press('Control+k');
        const searchDialog = page.getByRole('dialog', { name: 'Search' });
        await searchDialog.getByPlaceholder('Search tasks, lists, spaces').fill(marker);

        const taskOption = searchDialog.getByRole('option').filter({ hasText: taskTitle });
        await expect(taskOption).toBeVisible();
        await expect(
            searchDialog.getByRole('option', { name: listName, exact: true }),
        ).toBeVisible();
        await expect(
            searchDialog.getByRole('option', { name: spaceName, exact: true }),
        ).toBeVisible();

        await taskOption.click();
        await page.waitForURL(new RegExp(`/lists/${listId}/tasks/`));
    });

    test('search results are scoped to the current user', async ({ page, browser, testUser }) => {
        await loginAs(page, testUser);
        await page.goto('/spaces');
        const marker = uniqueName('Secret');
        await createSpace(page, `${marker} Space`);

        const otherUser = await createTestUser();
        try {
            const otherContext = await browser.newContext();
            const otherPage = await otherContext.newPage();
            await loginAs(otherPage, otherUser);

            const searchResponse = await otherPage.request.get(
                `/api/search?q=${encodeURIComponent(marker)}`,
            );
            expect(await searchResponse.json()).toEqual({ tasks: [], lists: [], spaces: [] });

            await otherContext.close();
        } finally {
            await deleteTestUser(otherUser.id);
        }
    });

    test('list export produces CSV and JSON with the expected task', async ({ page, testUser }) => {
        await loginAs(page, testUser);
        await page.goto('/spaces');
        const spaceName = await createSpace(page);
        const listName = await createList(page, spaceName);
        await spaceSection(page, spaceName).getByRole('link', { name: listName }).click();
        await page.waitForURL(/\/lists\//);
        const taskTitle = await createTask(page);

        await page.getByRole('button', { name: 'Export' }).click();
        const csvHref = await page
            .getByRole('menuitem', { name: 'Export as CSV' })
            .getAttribute('href');
        const jsonHref = await page
            .getByRole('menuitem', { name: 'Export as JSON' })
            .getAttribute('href');

        const csvResponse = await page.request.get(csvHref);
        expect(csvResponse.headers()['content-type']).toContain('text/csv');
        expect(await csvResponse.text()).toContain(taskTitle);

        const jsonResponse = await page.request.get(jsonHref);
        expect(jsonResponse.headers()['content-type']).toContain('application/json');
        const jsonBody = await jsonResponse.json();
        expect(jsonBody.tasks.some((task) => task.title === taskTitle)).toBe(true);
    });

    test('sublist and space export work without a UI trigger', async ({ page, testUser }) => {
        await loginAs(page, testUser);
        await page.goto('/spaces');
        const spaceName = await createSpace(page);
        const listName = await createList(page, spaceName);
        await spaceSection(page, spaceName).getByRole('link', { name: listName }).click();
        await page.waitForURL(/\/lists\//);
        const sublistName = await createSublist(page, spaceName, listName);
        const taskTitle = await createTask(page);

        const { data: sublist } = await adminClient()
            .from('sublists')
            .select('id')
            .eq('name', sublistName)
            .single();
        const { data: space } = await adminClient()
            .from('spaces')
            .select('id')
            .eq('name', spaceName)
            .single();

        const sublistExport = await page.request.get(
            `/api/export?type=sublist&id=${sublist.id}&format=json`,
        );
        expect(sublistExport.status()).toBe(200);
        const sublistBody = await sublistExport.json();
        expect(Array.isArray(sublistBody.tasks)).toBe(true);

        const spaceExport = await page.request.get(
            `/api/export?type=space&id=${space.id}&format=json`,
        );
        expect(spaceExport.status()).toBe(200);
        const spaceBody = await spaceExport.json();
        expect(spaceBody.tasks.some((task) => task.title === taskTitle)).toBe(true);
    });

    test('cross-account export is blocked', async ({ page, browser, testUser }) => {
        await loginAs(page, testUser);
        await page.goto('/spaces');
        const spaceName = await createSpace(page);
        const listName = await createList(page, spaceName);
        const { data: list } = await adminClient()
            .from('lists')
            .select('id')
            .eq('name', listName)
            .single();

        const otherUser = await createTestUser();
        try {
            const otherContext = await browser.newContext();
            const otherPage = await otherContext.newPage();
            await loginAs(otherPage, otherUser);

            const response = await otherPage.request.get(
                `/api/export?type=list&id=${list.id}&format=csv`,
            );
            expect(response.status()).toBe(404);
            expect(await response.json()).toEqual({ error: 'Not found' });

            await otherContext.close();
        } finally {
            await deleteTestUser(otherUser.id);
        }
    });
});
