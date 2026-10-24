import { test, expect, loginAs } from './fixtures/test.js';
import {
    createSpace,
    createList,
    createTask,
    createHabit,
    spaceSection,
} from './fixtures/app-data.js';

test.describe('timer zone FAB', () => {
    let taskTitle;
    let habitTitle;

    test.beforeEach(async ({ page, testUser, isMobile }) => {
        test.skip(!isMobile, 'The Timer FAB lives in the bottom nav below the lg breakpoint');

        await loginAs(page, testUser);
        await page.goto('/spaces');
        const spaceName = await createSpace(page);
        const listName = await createList(page, spaceName);
        await spaceSection(page, spaceName).getByRole('link', { name: listName }).click();
        await page.waitForURL(/\/lists\//);
        taskTitle = await createTask(page);

        await page.goto('/habits');
        habitTitle = await createHabit(page);

        await page.goto('/timer');
    });

    /**
     * Opens the Timer FAB's speed-dial and clicks one of its three menu items.
     *
     * @param {import('@playwright/test').Page} page
     * @param {'Start Standalone Timer'|'Start Task Timer'|'Start Habit Timer'} itemName
     * @returns {Promise<void>}
     */
    async function openTimerFabMenuItem(page, itemName) {
        await page
            .locator('nav.translucent-bar')
            .getByRole('button', { name: 'Start a timer...' })
            .click();
        await page.getByRole('menuitem', { name: itemName }).click();
    }

    test('starting a task timer and a habit timer shows both panels at once', async ({ page }) => {
        await openTimerFabMenuItem(page, 'Start Task Timer');
        await page.getByRole('combobox', { name: 'Search tasks' }).fill(taskTitle);
        await page.getByText(taskTitle, { exact: true }).click();
        await expect(page.getByRole('dialog')).toBeHidden();
        await expect(page.getByText(taskTitle, { exact: true })).toBeVisible();

        await openTimerFabMenuItem(page, 'Start Habit Timer');
        await page.getByText(habitTitle, { exact: true }).click();
        await expect(page.getByRole('dialog')).toBeHidden();

        await expect(page.getByText(taskTitle, { exact: true })).toBeVisible();
        await expect(page.getByText(habitTitle, { exact: true })).toBeVisible();
    });

    test('an already-live task shows as already tracking when the picker is reopened', async ({
        page,
    }) => {
        await openTimerFabMenuItem(page, 'Start Task Timer');
        await page.getByRole('combobox', { name: 'Search tasks' }).fill(taskTitle);
        await page.getByText(taskTitle, { exact: true }).click();
        await expect(page.getByRole('dialog')).toBeHidden();

        await openTimerFabMenuItem(page, 'Start Task Timer');
        await page.getByRole('combobox', { name: 'Search tasks' }).fill(taskTitle);
        await expect(page.getByText('Already tracking')).toBeVisible();

        // Disabled, so the already-live session stays exactly one panel, not a second one.
        await page.getByText(taskTitle, { exact: true }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await expect(page.getByText(taskTitle, { exact: true })).toHaveCount(2);
    });

    test('starting a standalone timer shows its panel and disables Standalone everywhere while it runs', async ({
        page,
    }) => {
        const label = 'Deep work session';

        await openTimerFabMenuItem(page, 'Start Standalone Timer');
        await page.getByRole('dialog').getByLabel('Session label').fill(label);
        await page.getByRole('dialog').getByRole('button', { name: 'Start' }).click();
        await expect(page.getByRole('dialog')).toBeHidden();
        await expect(page.getByText(label, { exact: true })).toBeVisible();

        await page
            .locator('nav.translucent-bar')
            .getByRole('button', { name: 'Start a timer...' })
            .click();
        await expect(page.getByRole('menuitem', { name: 'Start Standalone Timer' })).toBeDisabled();
        await page.keyboard.press('Escape');

        await expect(page.getByRole('button', { name: 'Start Standalone Timer' })).toBeDisabled();
        await expect(page.getByText(/you already have a running timer/i)).toBeVisible();
    });
});
