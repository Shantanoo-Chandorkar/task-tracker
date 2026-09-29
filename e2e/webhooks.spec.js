import { test, expect, loginAs } from './fixtures/test.js';
import { adminClient, createTestUser, deleteTestUser } from './fixtures/test-users.js';
import {
    uniqueName,
    createSpace,
    spaceSection,
    requestToJoinViaUi,
    openSharingPanel,
    approveJoinRequestViaUi,
} from './fixtures/app-data.js';

// example.com resolves to public addresses, so the server-side host check passes without a real receiver
const RECEIVER_URL = 'https://example.com/task-tracker-e2e';

/**
 * Opens the space's settings sheet and expands its Webhooks section.
 * This helper is the only opener of both toggles - neither is idempotent (docs/e2e-test-quality.md #3).
 *
 * @param {import('@playwright/test').Page} page - Already on /spaces.
 * @param {string} spaceName
 * @returns {Promise<import('@playwright/test').Locator>} The settings sheet.
 */
async function openWebhookSettings(page, spaceName) {
    await spaceSection(page, spaceName).getByRole('button', { name: 'Space settings' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: 'Webhooks', exact: true }).click();
    return sheet;
}

/**
 * Fills the add-webhook form and submits it.
 *
 * @param {import('@playwright/test').Locator} sheet - The open settings sheet.
 * @param {{ name: string, url?: string }} fields
 * @returns {Promise<void>}
 */
async function submitNewWebhook(sheet, { name, url = RECEIVER_URL }) {
    await sheet.getByRole('button', { name: 'Add webhook', exact: true }).click();
    await sheet.getByPlaceholder('Webhook name').fill(name);
    await sheet.getByPlaceholder('https://hooks.example.com/...').fill(url);
    await sheet.getByRole('button', { name: 'Create webhook', exact: true }).click();
}

/**
 * Creates a webhook through the real form and dismisses the one-time secret.
 *
 * @param {import('@playwright/test').Locator} sheet - The open settings sheet.
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 * @returns {Promise<void>}
 */
async function createWebhook(sheet, page, name) {
    await submitNewWebhook(sheet, { name });
    await expect(page.getByText('Webhook created', { exact: true }).first()).toBeVisible();
    await sheet.getByRole('button', { name: 'I have saved it' }).click();
    await expect(sheet.getByRole('heading', { name, exact: true })).toBeVisible();
}

test.describe('webhooks', () => {
    let spaceName;

    test.beforeEach(async ({ page, testUser }) => {
        await loginAs(page, testUser);
        await page.goto('/spaces');
        spaceName = await createSpace(page);
    });

    test('the owner adds a webhook and sees the signing secret exactly once', async ({ page }) => {
        const sheet = await openWebhookSettings(page, spaceName);
        const name = uniqueName('Hook');
        await submitNewWebhook(sheet, { name });

        await expect(sheet.getByLabel('Signing secret', { exact: true })).toHaveValue(/^whsec_/);
        await sheet.getByRole('button', { name: 'I have saved it' }).click();
        await expect(sheet.getByLabel('Signing secret', { exact: true })).toHaveCount(0);

        const webhookHeading = sheet.getByRole('heading', { name, exact: true });
        await expect(webhookHeading).toBeVisible();
        await expect(sheet.getByText('https://example.com/…', { exact: true })).toBeVisible();
        await expect(sheet.getByText('Active', { exact: true })).toBeVisible();

        // After a reload the secret is gone for good: there is no way to read it back
        await page.reload();
        const reopenedSheet = await openWebhookSettings(page, spaceName);
        await expect(reopenedSheet.getByRole('heading', { name, exact: true })).toBeVisible();
        await expect(reopenedSheet.getByLabel('Signing secret', { exact: true })).toHaveCount(0);
    });

    test('an address that is not a public https URL is refused with a clear message', async ({
        page,
    }) => {
        const sheet = await openWebhookSettings(page, spaceName);
        await submitNewWebhook(sheet, { name: uniqueName('Bad'), url: 'https://localhost/hook' });

        await expect(
            page.getByText('Enter a public https URL', { exact: true }).first(),
        ).toBeVisible();
        await expect(
            sheet.getByRole('button', { name: 'Create webhook', exact: true }),
        ).toBeEnabled();
        await expect(sheet.getByLabel('Signing secret', { exact: true })).toHaveCount(0);
    });

    test('choosing full detail warns that descriptions leave the app', async ({ page }) => {
        const sheet = await openWebhookSettings(page, spaceName);
        await sheet.getByRole('button', { name: 'Add webhook', exact: true }).click();

        await expect(sheet.getByText('Full detail sends task descriptions')).toHaveCount(0);
        await sheet.getByRole('radio', { name: /^Full/ }).check();
        await expect(
            sheet.getByText('Full detail sends task descriptions', { exact: false }),
        ).toBeVisible();
    });

    test('unticking every event is refused before anything is sent', async ({ page }) => {
        const sheet = await openWebhookSettings(page, spaceName);
        await sheet.getByRole('button', { name: 'Add webhook', exact: true }).click();
        await sheet.getByPlaceholder('https://hooks.example.com/...').fill(RECEIVER_URL);
        await sheet.getByRole('checkbox', { name: 'All task events', exact: true }).click();
        await sheet.getByRole('button', { name: 'Create webhook', exact: true }).click();

        await expect(
            page.getByText('Choose at least one event to send', { exact: true }).first(),
        ).toBeVisible();
    });

    test('an owner can turn a webhook off and on again', async ({ page }) => {
        const sheet = await openWebhookSettings(page, spaceName);
        await createWebhook(sheet, page, uniqueName('Hook'));

        await sheet.getByRole('button', { name: 'Turn off', exact: true }).click();
        await expect(sheet.getByText('Off', { exact: true })).toBeVisible();
        await expect(
            sheet.getByRole('button', { name: 'Send test event', exact: true }),
        ).toBeDisabled();

        await sheet.getByRole('button', { name: 'Turn on', exact: true }).click();
        await expect(sheet.getByText('Active', { exact: true })).toBeVisible();
    });

    test('sending a test event queues it and shows it in the delivery log', async ({ page }) => {
        const sheet = await openWebhookSettings(page, spaceName);
        await createWebhook(sheet, page, uniqueName('Hook'));

        await sheet.getByRole('button', { name: 'Send test event', exact: true }).click();
        await expect(page.getByText('Test event queued', { exact: false }).first()).toBeVisible();
        await expect(
            sheet
                .getByRole('list', { name: 'Recent deliveries' })
                .getByText('Test event', { exact: true }),
        ).toBeVisible();
    });

    test('rotating the secret shows a new one once', async ({ page }) => {
        const sheet = await openWebhookSettings(page, spaceName);
        await createWebhook(sheet, page, uniqueName('Hook'));

        await sheet.getByRole('button', { name: 'Rotate secret', exact: true }).click();
        await page
            .getByRole('alertdialog')
            .getByRole('button', { name: 'Rotate', exact: true })
            .click();

        await expect(sheet.getByLabel('Signing secret', { exact: true })).toHaveValue(/^whsec_/);
        await sheet.getByRole('button', { name: 'I have saved it' }).click();
        await expect(sheet.getByLabel('Signing secret', { exact: true })).toHaveCount(0);
    });

    test('editing a webhook renames it', async ({ page }) => {
        const sheet = await openWebhookSettings(page, spaceName);
        await createWebhook(sheet, page, uniqueName('Hook'));
        const newName = uniqueName('Renamed');

        await sheet.getByRole('button', { name: 'Edit', exact: true }).click();
        await sheet.getByPlaceholder('Webhook name').fill(newName);
        await sheet.getByRole('button', { name: 'Save changes', exact: true }).click();

        await expect(sheet.getByRole('heading', { name: newName, exact: true })).toBeVisible();
    });

    test('deleting a webhook removes it and offers to add one again', async ({ page }) => {
        const sheet = await openWebhookSettings(page, spaceName);
        const name = uniqueName('Hook');
        await createWebhook(sheet, page, name);

        await sheet.getByRole('button', { name: 'Delete webhook', exact: true }).click();
        await page
            .getByRole('alertdialog')
            .getByRole('button', { name: 'Delete', exact: true })
            .click();

        await expect(sheet.getByRole('heading', { name, exact: true })).toHaveCount(0);
        await expect(sheet.getByRole('button', { name: 'Add webhook', exact: true })).toBeVisible();
    });

    test('a network failure shows an error and leaves the form usable', async ({ page }) => {
        const sheet = await openWebhookSettings(page, spaceName);
        await sheet.getByRole('button', { name: 'Add webhook', exact: true }).click();
        await sheet.getByPlaceholder('https://hooks.example.com/...').fill(RECEIVER_URL);

        // Server actions are POSTs carrying a Next-Action header; failing only those keeps the page itself alive
        await page.route('**/*', (route) =>
            route.request().headers()['next-action'] ? route.abort() : route.continue(),
        );
        await sheet.getByRole('button', { name: 'Create webhook', exact: true }).click();

        await expect(
            page.getByText('Could not reach the server. Try again.').first(),
        ).toBeVisible();
        await expect(
            sheet.getByRole('button', { name: 'Create webhook', exact: true }),
        ).toBeEnabled();
    });
});

test.describe('webhooks: who can see them', () => {
    test('a collaborator sees the other settings but no Webhooks section', async ({
        browser,
        page,
        testUser,
    }) => {
        await loginAs(page, testUser);
        await page.goto('/spaces');
        const spaceName = await createSpace(page);
        const { data: space } = await adminClient()
            .from('spaces')
            .select('id')
            .eq('name', spaceName)
            .single();

        const collaborator = await createTestUser();
        const context = await browser.newContext();
        try {
            const collaboratorPage = await context.newPage();
            await loginAs(collaboratorPage, collaborator);
            await collaboratorPage.goto('/spaces');
            await requestToJoinViaUi(collaboratorPage, space.id);
            await expect(
                collaboratorPage.getByText('Request sent - the owner will be notified.'),
            ).toBeVisible();

            await openSharingPanel(spaceSection(page, spaceName));
            await approveJoinRequestViaUi(page, spaceSection(page, spaceName), collaborator.email);

            await collaboratorPage.goto('/spaces');
            await collaboratorPage.waitForLoadState('networkidle');
            await collaboratorPage.waitForTimeout(1000);
            await collaboratorPage.reload();
            await spaceSection(collaboratorPage, spaceName)
                .getByRole('button', { name: 'Space settings' })
                .click();

            const sheet = collaboratorPage.getByRole('dialog');
            await expect(
                sheet.getByRole('button', { name: 'Preferences', exact: true }),
            ).toBeVisible();
            await expect(sheet.getByRole('button', { name: 'Webhooks', exact: true })).toHaveCount(
                0,
            );
        } finally {
            await context.close();
            await deleteTestUser(collaborator.id);
        }
    });
});
