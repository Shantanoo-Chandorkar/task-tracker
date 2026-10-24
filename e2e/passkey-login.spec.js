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

test.describe('passkey login', () => {
    test('signs in through the browser autofill prompt, without ever touching the password field', async ({
        page,
        testUser,
    }) => {
        await addVirtualAuthenticator(page);
        await loginAs(page, testUser);

        await page.goto('/settings');
        await page.getByRole('button', { name: 'Enable passkey on this device' }).click();
        await expect(page.getByText('Passkey added')).toBeVisible();

        await page.getByRole('button', { name: 'Log out' }).click();
        await page.waitForURL('/login');

        // The virtual authenticator auto-answers the conditional-UI request with its resident credential.
        await page.waitForURL('/');
    });

    test('falls through to a working password form when the browser has no matching passkey', async ({
        page,
        testUser,
    }) => {
        // A real authenticator is present, but no passkey was ever registered for this account.
        await addVirtualAuthenticator(page);

        await loginAs(page, testUser);
    });
});
