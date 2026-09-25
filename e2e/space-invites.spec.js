import { randomUUID } from 'node:crypto';
import { test, expect, loginAs } from './fixtures/test.js';
import { adminClient, createTestUser, deleteTestUser } from './fixtures/test-users.js';
import { waitForEmailTo, clearInbox } from './fixtures/mailpit.js';
import {
    createSpace,
    spaceSection,
    openSharingPanel,
    sendInviteViaUi,
    pendingInviteRow,
    approveJoinRequestViaUi,
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
    const { data: space } = await adminClient()
        .from('spaces')
        .select('id')
        .eq('name', spaceName)
        .single();
    return { spaceName, spaceId: space.id };
}

/**
 * Pulls the relative accept-invite path (with its token) out of a Mailpit email's plain-text
 * body - the exact link a real recipient would click, per docs/e2e-test-quality.md.
 *
 * @param {string} emailText - `Text` field of a Mailpit message.
 * @returns {string} e.g. "/invites/accept?token=abc123".
 */
function extractAcceptPath(emailText) {
    const match = emailText.match(/(\/invites\/accept\?token=[^\s<"]+)/);
    if (!match) throw new Error('No accept-invite link found in email body');
    return match[1];
}

/**
 * Pulls the relative signup-confirmation path out of a Mailpit email's plain-text body.
 *
 * @param {string} emailText - `Text` field of a Mailpit message.
 * @returns {string} e.g. "/auth/confirm?token_hash=...&type=signup&next=...".
 */
function extractConfirmPath(emailText) {
    const match = emailText.match(/(\/auth\/confirm\?[^\s<"]+)/);
    if (!match) throw new Error('No confirmation link found in email body');
    return match[1];
}

test.describe('space invites', () => {
    test.beforeEach(async () => {
        await clearInbox();
    });

    test('inviting an email with no existing account: sign up, confirm, request, owner approves', async ({
        page,
        testUser,
    }) => {
        test.setTimeout(120_000);
        await loginAs(page, testUser);
        const { spaceName } = await createOwnedSpace(page);

        const invitedEmail = `e2e-invite-${randomUUID().slice(0, 8)}@example.com`;
        const invitedPassword = `Test-${randomUUID()}`;

        await openSharingPanel(spaceSection(page, spaceName));
        await sendInviteViaUi(page, spaceSection(page, spaceName), invitedEmail);
        await expect(pendingInviteRow(spaceSection(page, spaceName), invitedEmail)).toBeVisible();

        const inviteMessage = await waitForEmailTo(invitedEmail);
        const acceptPath = extractAcceptPath(inviteMessage.Text);

        const invitedContext = await page.context().browser().newContext();
        const invitedPage = await invitedContext.newPage();
        try {
            await invitedPage.goto(acceptPath);
            await expect(
                invitedPage.getByRole('heading', { name: `You're invited to join "${spaceName}"` }),
            ).toBeVisible();
            await invitedPage.getByRole('link', { name: 'Sign up' }).click();

            await invitedPage.getByLabel('Name', { exact: true }).fill('Invited Person');
            await invitedPage.getByLabel('Email', { exact: true }).fill(invitedEmail);
            await invitedPage.getByLabel('Password', { exact: true }).fill(invitedPassword);
            await invitedPage.getByRole('button', { name: 'Sign up' }).click();
            await expect(invitedPage.getByText('Account created.')).toBeVisible();

            const confirmMessage = await waitForEmailTo(invitedEmail);
            const confirmPath = extractConfirmPath(confirmMessage.Text);
            await invitedPage.goto(confirmPath);

            await expect(
                invitedPage.getByRole('heading', { name: `Join "${spaceName}"` }),
            ).toBeVisible();
            await invitedPage.getByRole('button', { name: 'Request to join' }).click();
            await expect(invitedPage.getByText('Request sent')).toBeVisible();

            await page.reload();
            await openSharingPanel(spaceSection(page, spaceName));
            await approveJoinRequestViaUi(page, spaceSection(page, spaceName), invitedEmail);

            const { data: collaborator } = await adminClient()
                .from('space_collaborators')
                .select('user_id, status, permission_level')
                .eq('requester_email', invitedEmail)
                .single();
            expect(collaborator.status).toBe('accepted');
            expect(collaborator.permission_level).toBe('restricted');

            await deleteTestUser(collaborator.user_id);
        } finally {
            await invitedContext.close();
        }
    });

    test('inviting an existing account: log in via the link, request, owner approves', async ({
        page,
        browser,
        testUser,
    }) => {
        await loginAs(page, testUser);
        const { spaceName } = await createOwnedSpace(page);

        const invitedUser = await createTestUser();
        try {
            await openSharingPanel(spaceSection(page, spaceName));
            await sendInviteViaUi(page, spaceSection(page, spaceName), invitedUser.email);

            const inviteMessage = await waitForEmailTo(invitedUser.email);
            const acceptPath = extractAcceptPath(inviteMessage.Text);

            const context = await browser.newContext();
            const invitedPage = await context.newPage();
            try {
                await invitedPage.goto(acceptPath);
                await invitedPage.getByRole('link', { name: 'Log in' }).click();
                await invitedPage.getByLabel('Email', { exact: true }).fill(invitedUser.email);
                await invitedPage
                    .getByLabel('Password', { exact: true })
                    .fill(invitedUser.password);
                await invitedPage.getByRole('button', { name: 'Log in' }).click();

                await expect(
                    invitedPage.getByRole('heading', { name: `Join "${spaceName}"` }),
                ).toBeVisible();
                await invitedPage.getByRole('button', { name: 'Request to join' }).click();
                await expect(invitedPage.getByText('Request sent')).toBeVisible();
            } finally {
                await context.close();
            }

            await page.reload();
            await openSharingPanel(spaceSection(page, spaceName));
            await approveJoinRequestViaUi(page, spaceSection(page, spaceName), invitedUser.email);

            const { data: collaborator } = await adminClient()
                .from('space_collaborators')
                .select('status')
                .eq('user_id', invitedUser.id)
                .single();
            expect(collaborator.status).toBe('accepted');
        } finally {
            await deleteTestUser(invitedUser.id);
        }
    });

    test('a mismatched account sees the exact email-mismatch message and is not added', async ({
        page,
        browser,
        testUser,
    }) => {
        await loginAs(page, testUser);
        const { spaceName } = await createOwnedSpace(page);

        const invitedUser = await createTestUser();
        const wrongUser = await createTestUser();
        try {
            await openSharingPanel(spaceSection(page, spaceName));
            await sendInviteViaUi(page, spaceSection(page, spaceName), invitedUser.email);

            const inviteMessage = await waitForEmailTo(invitedUser.email);
            const acceptPath = extractAcceptPath(inviteMessage.Text);

            const context = await browser.newContext();
            const wrongPage = await context.newPage();
            try {
                await loginAs(wrongPage, wrongUser);
                await wrongPage.goto(acceptPath);
                await wrongPage.getByRole('button', { name: 'Request to join' }).click();
                await expect(
                    wrongPage.getByText(
                        `This invite was sent to ${invitedUser.email}. You are signed in as ${wrongUser.email}.`,
                    ),
                ).toBeVisible();
            } finally {
                await context.close();
            }

            const { data: rows } = await adminClient()
                .from('space_collaborators')
                .select('id')
                .eq('user_id', wrongUser.id);
            expect(rows).toHaveLength(0);
        } finally {
            await deleteTestUser(invitedUser.id);
            await deleteTestUser(wrongUser.id);
        }
    });

    test('re-inviting the same email refreshes one row instead of duplicating it', async ({
        page,
        testUser,
    }) => {
        await loginAs(page, testUser);
        const { spaceName, spaceId } = await createOwnedSpace(page);
        const invitedEmail = `e2e-invite-${randomUUID().slice(0, 8)}@example.com`;

        await openSharingPanel(spaceSection(page, spaceName));
        await sendInviteViaUi(page, spaceSection(page, spaceName), invitedEmail);
        await waitForEmailTo(invitedEmail);

        await clearInbox();
        await sendInviteViaUi(page, spaceSection(page, spaceName), invitedEmail);
        await waitForEmailTo(invitedEmail);

        const { data: invites } = await adminClient()
            .from('space_invites')
            .select('id')
            .eq('space_id', spaceId)
            .eq('invited_email', invitedEmail)
            .eq('status', 'pending');
        expect(invites).toHaveLength(1);
    });

    test('revoking an invite invalidates its link', async ({ page, testUser }) => {
        await loginAs(page, testUser);
        const { spaceName } = await createOwnedSpace(page);
        const invitedEmail = `e2e-invite-${randomUUID().slice(0, 8)}@example.com`;

        await openSharingPanel(spaceSection(page, spaceName));
        await sendInviteViaUi(page, spaceSection(page, spaceName), invitedEmail);
        const inviteMessage = await waitForEmailTo(invitedEmail);
        const acceptPath = extractAcceptPath(inviteMessage.Text);

        await pendingInviteRow(spaceSection(page, spaceName), invitedEmail)
            .getByRole('button', { name: 'Revoke invite' })
            .click();
        const confirmDialog = page.getByRole('alertdialog');
        await confirmDialog.getByRole('button', { name: 'Revoke' }).click();
        await expect(page.getByText('Invite revoked')).toBeVisible();

        await page.goto(acceptPath);
        await expect(page.getByRole('heading', { name: 'Invalid invite link' })).toBeVisible();
    });

    test('an expired invite shows the expired message, not the generic invalid one', async ({
        page,
        testUser,
    }) => {
        await loginAs(page, testUser);
        const { spaceName, spaceId } = await createOwnedSpace(page);
        const invitedEmail = `e2e-invite-${randomUUID().slice(0, 8)}@example.com`;

        await openSharingPanel(spaceSection(page, spaceName));
        await sendInviteViaUi(page, spaceSection(page, spaceName), invitedEmail);
        const inviteMessage = await waitForEmailTo(invitedEmail);
        const acceptPath = extractAcceptPath(inviteMessage.Text);

        await adminClient()
            .from('space_invites')
            .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
            .eq('space_id', spaceId)
            .eq('invited_email', invitedEmail);

        await page.goto(acceptPath);
        await expect(page.getByRole('heading', { name: 'This invite has expired' })).toBeVisible();
    });
});
