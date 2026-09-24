import { test, expect, loginAs } from './fixtures/test.js';
import { adminClient, createTestUser, deleteTestUser } from './fixtures/test-users.js';
import { createSpace, createList, createSublist, createStatus, createTask, spaceSection } from './fixtures/app-data.js';

test.describe('cross-account data isolation', () => {
    test('a list is protected from another account', async ({ page, browser, testUser }) => {
        await loginAs(page, testUser);
        await page.goto('/spaces');
        const spaceName = await createSpace(page);
        const listName = await createList(page, spaceName);
        const { data: list } = await adminClient().from('lists').select('id').eq('name', listName).single();

        const otherUser = await createTestUser();
        try {
            const otherContext = await browser.newContext();
            const otherPage = await otherContext.newPage();
            await loginAs(otherPage, otherUser);

            const getResponse = await otherPage.request.get(`/api/lists/${list.id}`);
            expect(getResponse.status()).toBe(404);
            expect(await getResponse.json()).toEqual({ error: 'List not found' });

            const patchResponse = await otherPage.request.patch(`/api/lists/${list.id}`, {
                data: { name: 'hijacked' },
            });
            expect(patchResponse.status()).toBe(400);

            const deleteResponse = await otherPage.request.delete(`/api/lists/${list.id}`);
            expect(deleteResponse.status()).toBe(200);

            const { data: rowsStillPresent } = await adminClient().from('lists').select('id').eq('id', list.id);
            expect(rowsStillPresent).toHaveLength(1);

            await otherContext.close();
        } finally {
            await deleteTestUser(otherUser.id);
        }
    });

    test('a sublist is protected from another account', async ({ page, browser, testUser }) => {
        await loginAs(page, testUser);
        await page.goto('/spaces');
        const spaceName = await createSpace(page);
        const listName = await createList(page, spaceName);
        await spaceSection(page, spaceName).getByRole('link', { name: listName }).click();
        await page.waitForURL(/\/lists\//);
        const listId = page.url().match(/\/lists\/([^/]+)/)[1];
        const sublistName = await createSublist(page, spaceName, listName);
        const { data: sublist } = await adminClient().from('sublists').select('id').eq('name', sublistName).single();

        const otherUser = await createTestUser();
        try {
            const otherContext = await browser.newContext();
            const otherPage = await otherContext.newPage();
            await loginAs(otherPage, otherUser);

            const getResponse = await otherPage.request.get(`/api/sublists/${sublist.id}`);
            expect(getResponse.status()).toBe(404);
            expect(await getResponse.json()).toEqual({ error: 'Sublist not found' });

            const collectionResponse = await otherPage.request.get(`/api/sublists?list_id=${listId}`);
            expect(collectionResponse.status()).toBe(200);
            expect(await collectionResponse.json()).toEqual([]);

            const patchResponse = await otherPage.request.patch(`/api/sublists/${sublist.id}`, {
                data: { name: 'hijacked' },
            });
            expect(patchResponse.status()).toBe(400);

            const deleteResponse = await otherPage.request.delete(`/api/sublists/${sublist.id}`);
            expect(deleteResponse.status()).toBe(200);

            const { data: rowsStillPresent } = await adminClient()
                .from('sublists')
                .select('id')
                .eq('id', sublist.id);
            expect(rowsStillPresent).toHaveLength(1);

            await otherContext.close();
        } finally {
            await deleteTestUser(otherUser.id);
        }
    });

    test('a task is protected from another account', async ({ page, browser, testUser }) => {
        await loginAs(page, testUser);
        await page.goto('/spaces');
        const spaceName = await createSpace(page);
        const listName = await createList(page, spaceName);
        await spaceSection(page, spaceName).getByRole('link', { name: listName }).click();
        await page.waitForURL(/\/lists\//);
        const listId = page.url().match(/\/lists\/([^/]+)/)[1];
        const taskTitle = await createTask(page);
        const { data: task } = await adminClient().from('tasks').select('id').eq('title', taskTitle).single();

        const otherUser = await createTestUser();
        try {
            const otherContext = await browser.newContext();
            const otherPage = await otherContext.newPage();
            await loginAs(otherPage, otherUser);

            const collectionResponse = await otherPage.request.get(`/api/tasks?list_id=${listId}`);
            expect(collectionResponse.status()).toBe(200);
            expect(await collectionResponse.json()).toEqual([]);

            const patchResponse = await otherPage.request.patch(`/api/tasks/${task.id}`, {
                data: { title: 'hijacked' },
            });
            expect(patchResponse.status()).toBe(400);

            const moveResponse = await otherPage.request.post(`/api/tasks/${task.id}/move`, {
                data: { newParentId: null, afterSiblingId: null, listId },
            });
            expect(moveResponse.status()).toBe(404);
            expect(await moveResponse.json()).toEqual({ error: 'Task not found' });

            const deleteResponse = await otherPage.request.delete(`/api/tasks/${task.id}`);
            expect(deleteResponse.status()).toBe(200);

            const { data: rowsStillPresent } = await adminClient().from('tasks').select('id').eq('id', task.id);
            expect(rowsStillPresent).toHaveLength(1);

            await otherContext.close();
        } finally {
            await deleteTestUser(otherUser.id);
        }
    });

    test('a status is protected from another account', async ({ page, browser, testUser }) => {
        await loginAs(page, testUser);
        await page.goto('/spaces');
        const spaceName = await createSpace(page);
        const { data: space } = await adminClient().from('spaces').select('id').eq('name', spaceName).single();
        await spaceSection(page, spaceName).getByRole('button', { name: 'Statuses' }).click();
        const statusName = await createStatus(page, spaceName);
        const { data: status } = await adminClient().from('statuses').select('id').eq('name', statusName).single();

        const otherUser = await createTestUser();
        try {
            const otherContext = await browser.newContext();
            const otherPage = await otherContext.newPage();
            await loginAs(otherPage, otherUser);

            const collectionResponse = await otherPage.request.get(`/api/statuses?space_id=${space.id}`);
            expect(collectionResponse.status()).toBe(200);
            expect(await collectionResponse.json()).toEqual([]);

            const patchResponse = await otherPage.request.patch(`/api/statuses/${status.id}`, {
                data: { name: 'hijacked' },
            });
            expect(patchResponse.status()).toBe(400);

            const deleteResponse = await otherPage.request.delete(`/api/statuses/${status.id}`);
            expect(deleteResponse.status()).toBe(400);
            expect(await deleteResponse.json()).toEqual({ error: 'Status not found' });

            const { data: rowsStillPresent } = await adminClient()
                .from('statuses')
                .select('id')
                .eq('id', status.id);
            expect(rowsStillPresent).toHaveLength(1);

            await otherContext.close();
        } finally {
            await deleteTestUser(otherUser.id);
        }
    });
});
