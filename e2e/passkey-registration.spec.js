import { test, expect, loginAs } from './fixtures/test.js';

/**
 * Registers a CDP virtual authenticator that satisfies this app's registration options
 * (residentKey/userVerification 'required', attachment 'platform') - Chromium only.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ cdpSession: object, authenticatorId: string }>}
 */
async function addVirtualAuthenticator(page) {
    const cdpSession = await page.context().newCDPSession(page);
    await cdpSession.send('WebAuthn.enable');
    const { authenticatorId } = await cdpSession.send('WebAuthn.addVirtualAuthenticator', {
        options: {
            protocol: 'ctap2',
            transport: 'internal',
            hasResidentKey: true,
            hasUserVerification: true,
            isUserVerified: true,
        },
    });
    return { cdpSession, authenticatorId };
}

test.describe('passkey registration', () => {
    test('enabling a passkey adds it to the list, and removing it takes it off again', async ({
        page,
        testUser,
    }) => {
        await addVirtualAuthenticator(page);
        await loginAs(page, testUser);

        await page.goto('/settings');
        await page.getByRole('button', { name: 'Enable passkey on this device' }).click();

        await expect(page.getByText('Passkey added')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Remove passkey' })).toBeVisible();
        await expect(page.getByText(/Added .* ago/)).toBeVisible();

        await page.getByRole('button', { name: 'Remove passkey' }).click();
        await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click();

        await expect(page.getByText('Passkey removed')).toBeVisible();
        await expect(page.getByText('No passkeys yet.')).toBeVisible();
    });

    test('a device without a resident-key-capable authenticator never gets a passkey added', async ({
        page,
        testUser,
    }) => {
        const { cdpSession, authenticatorId } = await addVirtualAuthenticator(page);
        // Simulate an authenticator that can't satisfy this app's residentKey: 'required' option.
        await cdpSession.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
        await cdpSession.send('WebAuthn.addVirtualAuthenticator', {
            options: {
                protocol: 'ctap2',
                transport: 'internal',
                hasResidentKey: false,
                hasUserVerification: true,
                isUserVerified: true,
            },
        });
        await loginAs(page, testUser);

        await page.goto('/settings');
        await page.getByRole('button', { name: 'Enable passkey on this device' }).click();

        await expect(
            page.getByText('Could not set up your passkey. Please try again.'),
        ).toBeVisible();
        await expect(page.getByText('No passkeys yet.')).toBeVisible();
    });
});
