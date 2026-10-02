import { test, expect, loginAs } from './fixtures/test.js';
import { createSpace, spaceSection } from './fixtures/app-data.js';

test.describe('home empty state', () => {
    test('a space created here is owned by the user, with its owner controls', async ({
        page,
        testUser,
    }) => {
        await loginAs(page, testUser);
        await expect(page.getByRole('heading', { name: 'Welcome to Task Tracker' })).toBeVisible();

        const spaceName = await createSpace(page);

        await expect(
            spaceSection(page, spaceName).getByRole('button', { name: 'Edit space' }),
        ).toBeVisible();
        await expect(page.getByText('Shared with you')).toHaveCount(0);
    });
});
