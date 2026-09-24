import { test, expect, loginAs } from './fixtures/test.js';
import { adminClient } from './fixtures/test-users.js';
import {
    uniqueName,
    createList,
    createSublist,
    createStatus,
    createTask,
    spaceSection,
    startGuestSession,
} from './fixtures/app-data.js';

const GUEST_SPACE_NAME = 'Guest Playground';
const GUEST_SEEDED_LIST_NAME = 'Product Launch';

test.describe('guest mode', () => {
    // Guest sessions are capped at GUEST_SESSIONS_PER_IP_PER_HOUR (5) - run once, not per-viewport.
    test.beforeEach(({}, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop-chrome', 'Guest mode runs once, not per-viewport - see comment above.');
    });

    // Clears quota a previous run in the same hour left behind, before this run's tests start.
    test.beforeAll(async () => {
        await adminClient().from('auth_rate_limits').delete().eq('email', 'guest').eq('action_type', 'guest_create');
    });

    test('an expired-guest redirect shows the session-ended notice', async ({ page }) => {
        await page.goto('/login?reason=guest-expired');
        await expect(
            page.getByText('Your guest session ended. Sign up to keep your work, or start a new guest session below.'),
        ).toBeVisible();
    });

    test('the guest banner shows a live countdown, and the space limit blocks a 2nd space', async ({ page }) => {
        await startGuestSession(page);

        const banner = page.getByRole('region', { name: 'Guest mode' });
        await expect(banner.getByText('Guest mode.')).toBeVisible();
        await expect(banner.getByText(/\d+:\d{2} left/)).toBeVisible();

        await page.goto('/spaces');
        await page.getByRole('button', { name: '+ Add space' }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByPlaceholder('Space name').fill(uniqueName('Space'));
        await dialog.getByRole('button', { name: 'Create space' }).click();
        await expect(dialog.getByText('Guest mode is limited to 1 space. Sign up to create more.')).toBeVisible();
    });

    test('list, sublist, and status limits block once the seeded space hits its cap', async ({ page }) => {
        await startGuestSession(page);
        await page.goto('/spaces');

        await createList(page, GUEST_SPACE_NAME);
        await spaceSection(page, GUEST_SPACE_NAME).getByRole('button', { name: '+ Add list' }).click();
        const listDialog = page.getByRole('dialog');
        await listDialog.getByPlaceholder('List name').fill(uniqueName('List'));
        await listDialog.getByRole('button', { name: 'Create list' }).click();
        await expect(listDialog.getByText('Guest mode is limited to 3 lists. Sign up to create more.')).toBeVisible();
        await listDialog.getByRole('button', { name: 'Cancel' }).click();

        await spaceSection(page, GUEST_SPACE_NAME).getByRole('link', { name: GUEST_SEEDED_LIST_NAME }).click();
        await page.waitForURL(/\/lists\//);

        for (let sublistCount = 0; sublistCount < 4; sublistCount++) {
            await createSublist(page, GUEST_SPACE_NAME, GUEST_SEEDED_LIST_NAME);
        }
        await page.getByRole('button', { name: 'Create new...' }).click();
        await page.getByRole('menuitem', { name: 'New Sublist' }).click();
        await page.getByRole('combobox').click();
        await page.getByRole('option', { name: `${GUEST_SPACE_NAME} / ${GUEST_SEEDED_LIST_NAME}` }).click();
        const sublistDialog = page.getByRole('dialog');
        await sublistDialog.getByPlaceholder('Sublist name').fill(uniqueName('Sublist'));
        await sublistDialog.getByRole('button', { name: 'Create sublist' }).click();
        await expect(
            sublistDialog.getByText('Guest mode is limited to 6 sublists. Sign up to create more.'),
        ).toBeVisible();
        await sublistDialog.getByRole('button', { name: 'Cancel' }).click();

        await page.goto('/spaces');
        await spaceSection(page, GUEST_SPACE_NAME).getByRole('button', { name: 'Statuses' }).click();
        for (let statusCount = 0; statusCount < 5; statusCount++) {
            await createStatus(page, GUEST_SPACE_NAME);
        }
        await spaceSection(page, GUEST_SPACE_NAME).getByRole('button', { name: '+ Add status' }).click();
        const statusDialog = page.getByRole('dialog');
        await statusDialog.getByPlaceholder('Status name').fill(uniqueName('Status'));
        await statusDialog.getByRole('button', { name: 'Create status' }).click();
        await expect(
            statusDialog.getByText('Guest mode is limited to 8 statuses. Sign up to create more.'),
        ).toBeVisible();
    });

    test('sharing is hidden and password change is blocked for a guest', async ({ page }) => {
        await startGuestSession(page);
        await page.goto('/spaces');

        await expect(
            spaceSection(page, GUEST_SPACE_NAME).getByRole('button', { name: 'Share this space' }),
        ).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Join a space' })).toHaveCount(0);

        await page.goto('/reset-password');
        await page.getByLabel('New password', { exact: true }).fill('a-valid-password-123');
        await page.getByRole('button', { name: 'Update password' }).click();
        await expect(page.getByText('This feature is not available in guest mode. Sign up to use it.')).toBeVisible();
    });

    test("a guest's data isn't reachable by another account", async ({ page, browser, testUser }) => {
        await startGuestSession(page);
        await page.goto('/spaces');
        await spaceSection(page, GUEST_SPACE_NAME).getByRole('link', { name: GUEST_SEEDED_LIST_NAME }).click();
        await page.waitForURL(/\/lists\//);
        const listId = page.url().match(/\/lists\/([^/]+)/)[1];

        const taskTitle = await createTask(page);
        const listTasksResponse = await page.request.get(`/api/tasks?list_id=${listId}`);
        const tasks = await listTasksResponse.json();
        const task = tasks.find((candidate) => candidate.title === taskTitle);

        const otherContext = await browser.newContext();
        const otherPage = await otherContext.newPage();
        await loginAs(otherPage, testUser);

        const patchResponse = await otherPage.request.patch(`/api/tasks/${task.id}`, {
            data: { title: 'hijacked' },
        });
        expect(patchResponse.status()).toBe(400);

        const deleteResponse = await otherPage.request.delete(`/api/tasks/${task.id}`);
        expect(deleteResponse.status()).toBe(200);

        const { data: rowsStillPresent } = await adminClient().from('tasks').select('id').eq('id', task.id);
        expect(rowsStillPresent).toHaveLength(1);

        await otherContext.close();
    });
});
