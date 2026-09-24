import { test, expect } from './fixtures/test.js';
import { waitForEmailTo, clearInbox } from './fixtures/mailpit.js';

test.describe('mailpit harness smoke test', () => {
    test.beforeEach(async () => {
        await clearInbox();
    });

    test('a password-reset request sent through the real form arrives in Mailpit', async ({
        page,
        testUser,
    }) => {
        await page.goto('/forgot-password');
        await page.getByLabel('Email').fill(testUser.email);
        await page.getByRole('button', { name: 'Send reset link' }).click();
        await expect(
            page.getByText('If an account exists for that email, a reset link is on its way.'),
        ).toBeVisible();

        const receivedEmail = await waitForEmailTo(testUser.email);
        expect(receivedEmail.Subject).toBe('Reset your Task Tracker password');
    });
});
