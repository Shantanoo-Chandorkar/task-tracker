import { test, expect, loginAs } from './fixtures/test.js';
import { adminClient, createTestUser, deleteTestUser } from './fixtures/test-users.js';
import {
    createSpace,
    createList,
    createTask,
    addSubtask,
    taskRow,
    spaceSection,
    requestToJoinViaUi,
    openSharingPanel,
    approveJoinRequestViaUi,
} from './fixtures/app-data.js';

/**
 * Creates a space and list as the owner, returning ids needed for API-level permission checks.
 *
 * @param {import('@playwright/test').Page} ownerPage - Already logged in.
 * @returns {Promise<{spaceName: string, spaceId: string, listId: string}>}
 */
async function createOwnedSpaceAndList(ownerPage) {
    await ownerPage.goto('/spaces');
    const spaceName = await createSpace(ownerPage);
    const listName = await createList(ownerPage, spaceName);
    const { data: space } = await adminClient()
        .from('spaces')
        .select('id')
        .eq('name', spaceName)
        .single();
    const { data: list } = await adminClient()
        .from('lists')
        .select('id')
        .eq('name', listName)
        .single();
    return { spaceName, spaceId: space.id, listId: list.id };
}

/**
 * Onboards a fresh collaborator: requests to join and gets approved by the owner via the real UI,
 * landing at the default 'restricted' tier (0016's migration default for new approvals).
 *
 * @param {import('@playwright/test').Browser} browser
 * @param {import('@playwright/test').Page} ownerPage
 * @param {string} spaceName
 * @param {string} spaceId
 * @returns {Promise<{collaborator: object, collaboratorPage: import('@playwright/test').Page, context: object}>}
 */
async function onboardCollaborator(browser, ownerPage, spaceName, spaceId) {
    const collaborator = await createTestUser();
    const context = await browser.newContext();
    const collaboratorPage = await context.newPage();
    await loginAs(collaboratorPage, collaborator);
    await collaboratorPage.goto('/spaces');
    await requestToJoinViaUi(collaboratorPage, spaceId);
    await expect(
        collaboratorPage.getByText('Request sent - the owner will be notified.'),
    ).toBeVisible();

    await ownerPage.goto('/spaces');
    await openSharingPanel(spaceSection(ownerPage, spaceName));
    await approveJoinRequestViaUi(
        ownerPage,
        spaceSection(ownerPage, spaceName),
        collaborator.email,
    );

    return { collaborator, collaboratorPage, context };
}

/**
 * Changes a collaborator's permission tier via the owner's real sharing-panel Select control.
 * Caller must already have the sharing panel open (via openSharingPanel/onboardCollaborator).
 *
 * @param {import('@playwright/test').Page} ownerPage
 * @param {string} collaboratorEmail
 * @param {'Full'|'Restricted'|'Read-only'} label
 * @returns {Promise<void>}
 */
async function setCollaboratorPermission(ownerPage, collaboratorEmail, label) {
    await ownerPage.getByRole('combobox', { name: `Permission for ${collaboratorEmail}` }).click();
    await ownerPage.getByRole('option', { name: label, exact: true }).click();
    await expect(ownerPage.getByText('Permission updated')).toBeVisible();
}

test.describe('collaboration permission tiers', () => {
    test("a restricted collaborator can create and edit their own task, not someone else's", async ({
        page,
        browser,
        testUser,
    }) => {
        await loginAs(page, testUser);
        const { spaceName, spaceId, listId } = await createOwnedSpaceAndList(page);
        await page.goto(`/lists/${listId}`);
        const ownerTaskTitle = await createTask(page);

        const { collaborator, collaboratorPage, context } = await onboardCollaborator(
            browser,
            page,
            spaceName,
            spaceId,
        );
        try {
            const createResponse = await collaboratorPage.request.post('/api/tasks', {
                data: { title: 'Collaborator task', list_id: listId },
            });
            expect(createResponse.status()).toBe(201);
            const createdTask = await createResponse.json();

            const editOwnResponse = await collaboratorPage.request.patch(
                `/api/tasks/${createdTask.id}`,
                {
                    data: { title: 'Edited by collaborator' },
                },
            );
            expect(editOwnResponse.status()).toBe(200);

            const { data: ownerTask } = await adminClient()
                .from('tasks')
                .select('id')
                .eq('title', ownerTaskTitle)
                .single();
            const editOthersResponse = await collaboratorPage.request.patch(
                `/api/tasks/${ownerTask.id}`,
                {
                    data: { title: 'hijacked' },
                },
            );
            expect(editOthersResponse.status()).toBe(400);
            expect((await editOthersResponse.json()).code).toBe('PERMISSION_RESTRICTED_NOT_OWN');

            await context.close();
        } finally {
            await deleteTestUser(collaborator.id);
        }
    });

    test('a read-only collaborator cannot create a task', async ({ page, browser, testUser }) => {
        await loginAs(page, testUser);
        const { spaceName, spaceId, listId } = await createOwnedSpaceAndList(page);

        const { collaborator, collaboratorPage, context } = await onboardCollaborator(
            browser,
            page,
            spaceName,
            spaceId,
        );
        try {
            await setCollaboratorPermission(page, collaborator.email, 'Read-only');

            const createResponse = await collaboratorPage.request.post('/api/tasks', {
                data: { title: 'Should not be created', list_id: listId },
            });
            expect(createResponse.status()).toBe(400);
            expect((await createResponse.json()).code).toBe('PERMISSION_READ_ONLY');

            await context.close();
        } finally {
            await deleteTestUser(collaborator.id);
        }
    });

    test("the owner upgrading a collaborator to 'full' takes effect on their next action", async ({
        page,
        browser,
        testUser,
    }) => {
        await loginAs(page, testUser);
        const { spaceName, spaceId, listId } = await createOwnedSpaceAndList(page);
        await page.goto(`/lists/${listId}`);
        const ownerTaskTitle = await createTask(page);

        const { collaborator, collaboratorPage, context } = await onboardCollaborator(
            browser,
            page,
            spaceName,
            spaceId,
        );
        try {
            const { data: ownerTask } = await adminClient()
                .from('tasks')
                .select('id')
                .eq('title', ownerTaskTitle)
                .single();

            const blockedResponse = await collaboratorPage.request.patch(
                `/api/tasks/${ownerTask.id}`,
                {
                    data: { title: 'still restricted' },
                },
            );
            expect(blockedResponse.status()).toBe(400);

            await setCollaboratorPermission(page, collaborator.email, 'Full');

            const { data: updatedCollaborator } = await adminClient()
                .from('space_collaborators')
                .select('permission_level')
                .eq('space_id', spaceId)
                .eq('user_id', collaborator.id)
                .single();
            expect(updatedCollaborator.permission_level).toBe('full');

            const allowedResponse = await collaboratorPage.request.patch(
                `/api/tasks/${ownerTask.id}`,
                {
                    data: { title: 'edited after upgrade' },
                },
            );
            expect(allowedResponse.status()).toBe(200);

            await context.close();
        } finally {
            await deleteTestUser(collaborator.id);
        }
    });

    test('a full collaborator is unaffected by tier restrictions', async ({
        page,
        browser,
        testUser,
    }) => {
        await loginAs(page, testUser);
        const { spaceName, spaceId, listId } = await createOwnedSpaceAndList(page);
        await page.goto(`/lists/${listId}`);
        const ownerTaskTitle = await createTask(page);

        const { collaborator, collaboratorPage, context } = await onboardCollaborator(
            browser,
            page,
            spaceName,
            spaceId,
        );
        try {
            await setCollaboratorPermission(page, collaborator.email, 'Full');

            const { data: ownerTask } = await adminClient()
                .from('tasks')
                .select('id')
                .eq('title', ownerTaskTitle)
                .single();
            const editResponse = await collaboratorPage.request.patch(
                `/api/tasks/${ownerTask.id}`,
                {
                    data: { title: 'edited by full collaborator' },
                },
            );
            expect(editResponse.status()).toBe(200);

            const deleteResponse = await collaboratorPage.request.delete(
                `/api/tasks/${ownerTask.id}`,
            );
            expect(deleteResponse.status()).toBe(200);

            await context.close();
        } finally {
            await deleteTestUser(collaborator.id);
        }
    });

    test('cascade-completing a task the restricted collaborator does not fully own reports partial success', async ({
        page,
        browser,
        testUser,
    }) => {
        await loginAs(page, testUser);
        const { spaceName, spaceId, listId } = await createOwnedSpaceAndList(page);

        const { collaborator, collaboratorPage, context } = await onboardCollaborator(
            browser,
            page,
            spaceName,
            spaceId,
        );
        try {
            await collaboratorPage.goto(`/lists/${listId}`);
            const parentTitle = await createTask(collaboratorPage);

            await page.goto(`/lists/${listId}`);
            await addSubtask(page, taskRow(page, parentTitle));
            await context.close();

            // A brand-new context (fresh cache storage) instead of reusing/reloading collaboratorPage,
            // so this doesn't depend on the SW's stale-while-revalidate timing for a page it already visited.
            const freshContext = await browser.newContext();
            const freshCollaboratorPage = await freshContext.newPage();
            await loginAs(freshCollaboratorPage, collaborator);
            await freshCollaboratorPage.goto(`/lists/${listId}`);

            // Default viewport is mobile-sized, where the row's checkbox is hidden - go through the 3-dot menu.
            await taskRow(freshCollaboratorPage, parentTitle)
                .getByRole('button', { name: 'More actions' })
                .click();
            await freshCollaboratorPage.getByRole('menuitem', { name: 'Mark as complete' }).click();
            await expect(
                freshCollaboratorPage.getByText(`Mark “${parentTitle}” complete?`),
            ).toBeVisible();
            await freshCollaboratorPage.getByRole('button', { name: 'Mark complete' }).click();

            await expect(
                freshCollaboratorPage.getByText(
                    'Completed 1 of 2 tasks - you can only update tasks you created',
                ),
            ).toBeVisible();

            const { data: parentTask } = await adminClient()
                .from('tasks')
                .select('statuses(code)')
                .eq('title', parentTitle)
                .single();
            expect(parentTask.statuses.code).toBe('done');

            await freshContext.close();
        } finally {
            await deleteTestUser(collaborator.id);
        }
    });
});
