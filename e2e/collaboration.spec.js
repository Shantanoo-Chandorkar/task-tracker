import { test, expect, loginAs } from './fixtures/test.js';
import { adminClient, createTestUser, deleteTestUser, signInClient } from './fixtures/test-users.js';
import {
    createSpace,
    spaceSection,
    requestToJoinViaUi,
    openSharingPanel,
    collaboratorRow,
    approveJoinRequestViaUi,
    gotoFreshAfterExternalChange,
} from './fixtures/app-data.js';

/**
 * Creates a space as the given owner page and returns its name and DB id.
 *
 * @param {import('@playwright/test').Page} ownerPage - Already logged in.
 * @returns {Promise<{spaceName: string, spaceId: string}>}
 */
async function createOwnedSpace(ownerPage) {
    await ownerPage.goto('/spaces');
    const spaceName = await createSpace(ownerPage);
    const { data: space } = await adminClient().from('spaces').select('id').eq('name', spaceName).single();
    return { spaceName, spaceId: space.id };
}

/**
 * Opens a second browser context, logs in as a fresh test user, and requests to join a space.
 *
 * @param {import('@playwright/test').Browser} browser
 * @param {string} spaceId
 * @returns {Promise<{requester: object, requesterPage: import('@playwright/test').Page, context: object}>}
 */
async function requestToJoinAsNewUser(browser, spaceId) {
    const requester = await createTestUser();
    const context = await browser.newContext();
    const requesterPage = await context.newPage();
    await loginAs(requesterPage, requester);
    await requesterPage.goto('/spaces');
    await requestToJoinViaUi(requesterPage, spaceId);
    // Closing the context right after the click can abort the mutation mid-flight - wait for its success signal.
    await expect(requesterPage.getByText('Request sent - the owner will be notified.')).toBeVisible();
    return { requester, requesterPage, context };
}

test.describe('collaboration', () => {
    test('requesting to join a space, then a duplicate request is blocked', async ({ page, browser, testUser }) => {
        await loginAs(page, testUser);
        const { spaceId } = await createOwnedSpace(page);

        const { requester, requesterPage, context } = await requestToJoinAsNewUser(browser, spaceId);
        try {
            await expect(requesterPage.getByText('Request sent - the owner will be notified.')).toBeVisible();

            const { data: request } = await adminClient()
                .from('space_collaborators')
                .select('status')
                .eq('space_id', spaceId)
                .eq('user_id', requester.id)
                .single();
            expect(request.status).toBe('pending');

            await requestToJoinViaUi(requesterPage, spaceId);
            await expect(
                requesterPage.getByRole('dialog').getByText('You already requested or joined this space'),
            ).toBeVisible();

            await context.close();
        } finally {
            await deleteTestUser(requester.id);
        }
    });

    test('the owner approves a join request', async ({ page, browser, testUser }) => {
        await loginAs(page, testUser);
        const { spaceName, spaceId } = await createOwnedSpace(page);

        const { requester, context } = await requestToJoinAsNewUser(browser, spaceId);
        try {
            await context.close();

            await page.reload();
            await openSharingPanel(spaceSection(page, spaceName));
            await approveJoinRequestViaUi(page, spaceSection(page, spaceName), requester.email);

            await expect(
                collaboratorRow(spaceSection(page, spaceName), requester.email).getByRole('button', {
                    name: 'Remove collaborator',
                }),
            ).toBeVisible();

            const { data: collaborator } = await adminClient()
                .from('space_collaborators')
                .select('status')
                .eq('space_id', spaceId)
                .eq('user_id', requester.id)
                .single();
            expect(collaborator.status).toBe('accepted');
        } finally {
            await deleteTestUser(requester.id);
        }
    });

    test('the owner rejects a join request', async ({ page, browser, testUser }) => {
        await loginAs(page, testUser);
        const { spaceName, spaceId } = await createOwnedSpace(page);

        const { requester, context } = await requestToJoinAsNewUser(browser, spaceId);
        try {
            await context.close();

            await page.reload();
            await openSharingPanel(spaceSection(page, spaceName));
            await collaboratorRow(spaceSection(page, spaceName), requester.email)
                .getByRole('button', { name: 'Reject request' })
                .click();

            const confirmDialog = page.getByRole('alertdialog');
            await expect(confirmDialog.getByText(`Reject request from "${requester.email}"?`)).toBeVisible();
            await confirmDialog.getByRole('button', { name: 'Reject' }).click();
            await expect(page.getByText('Request rejected')).toBeVisible();

            const { data: rowsRemaining } = await adminClient()
                .from('space_collaborators')
                .select('id')
                .eq('space_id', spaceId)
                .eq('user_id', requester.id);
            expect(rowsRemaining).toHaveLength(0);
        } finally {
            await deleteTestUser(requester.id);
        }
    });

    test('an accepted collaborator can leave a space', async ({ page, browser, testUser }) => {
        await loginAs(page, testUser);
        const { spaceName, spaceId } = await createOwnedSpace(page);

        const { requester, requesterPage, context } = await requestToJoinAsNewUser(browser, spaceId);
        try {
            await page.reload();
            await openSharingPanel(spaceSection(page, spaceName));
            await approveJoinRequestViaUi(page, spaceSection(page, spaceName), requester.email);

            await gotoFreshAfterExternalChange(requesterPage, '/spaces');
            await spaceSection(requesterPage, spaceName).getByRole('button', { name: 'Leave space' }).click();
            const confirmDialog = requesterPage.getByRole('alertdialog');
            await expect(confirmDialog.getByText(`Leave "${spaceName}"?`)).toBeVisible();
            await confirmDialog.getByRole('button', { name: 'Leave' }).click();
            await expect(requesterPage.getByText('Left space')).toBeVisible();

            const { data: rowsRemaining } = await adminClient()
                .from('space_collaborators')
                .select('id')
                .eq('space_id', spaceId)
                .eq('user_id', requester.id);
            expect(rowsRemaining).toHaveLength(0);

            await context.close();
        } finally {
            await deleteTestUser(requester.id);
        }
    });

    test('the owner removes a collaborator', async ({ page, browser, testUser }) => {
        await loginAs(page, testUser);
        const { spaceName, spaceId } = await createOwnedSpace(page);

        const { requester, context } = await requestToJoinAsNewUser(browser, spaceId);
        try {
            await context.close();

            await page.reload();
            await openSharingPanel(spaceSection(page, spaceName));
            await approveJoinRequestViaUi(page, spaceSection(page, spaceName), requester.email);

            await collaboratorRow(spaceSection(page, spaceName), requester.email)
                .getByRole('button', { name: 'Remove collaborator' })
                .click();
            const confirmDialog = page.getByRole('alertdialog');
            await expect(confirmDialog.getByText(`Remove "${requester.email}" from this space?`)).toBeVisible();
            await confirmDialog.getByRole('button', { name: 'Remove' }).click();
            await expect(page.getByText('Collaborator removed')).toBeVisible();

            const { data: rowsRemaining } = await adminClient()
                .from('space_collaborators')
                .select('id')
                .eq('space_id', spaceId)
                .eq('user_id', requester.id);
            expect(rowsRemaining).toHaveLength(0);
        } finally {
            await deleteTestUser(requester.id);
        }
    });

    test('a non-owner cannot approve a join request', async ({ page, browser, testUser }) => {
        await loginAs(page, testUser);
        const { spaceId } = await createOwnedSpace(page);

        const { requester, context } = await requestToJoinAsNewUser(browser, spaceId);
        try {
            await context.close();

            const { data: request } = await adminClient()
                .from('space_collaborators')
                .select('id')
                .eq('space_id', spaceId)
                .eq('user_id', requester.id)
                .single();

            const nonOwner = await createTestUser();
            try {
                // RLS is the actual boundary under test - not reachable via UI, no non-owner ever sees the panel.
                const nonOwnerClient = await signInClient(nonOwner.email, nonOwner.password);
                const { data: updatedRows } = await nonOwnerClient
                    .from('space_collaborators')
                    .update({ status: 'accepted' })
                    .eq('id', request.id)
                    .select();
                expect(updatedRows).toHaveLength(0);

                const { data: requestAfter } = await adminClient()
                    .from('space_collaborators')
                    .select('status')
                    .eq('id', request.id)
                    .single();
                expect(requestAfter.status).toBe('pending');
            } finally {
                await deleteTestUser(nonOwner.id);
            }
        } finally {
            await deleteTestUser(requester.id);
        }
    });
});
