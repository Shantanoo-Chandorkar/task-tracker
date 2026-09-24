import { test, expect, loginAs } from './fixtures/test.js';
import {
    uniqueName,
    createSpace,
    createList,
    createTask,
    addSubtask,
    taskRow,
    spaceSection,
} from './fixtures/app-data.js';

test.describe('tasks', () => {
    let listId;

    test.beforeEach(async ({ page, testUser }) => {
        await loginAs(page, testUser);
        await page.goto('/spaces');
        const spaceName = await createSpace(page);
        const listName = await createList(page, spaceName);
        await spaceSection(page, spaceName).getByRole('link', { name: listName }).click();
        await page.waitForURL(/\/lists\//);
        listId = page.url().match(/\/lists\/([^/]+)/)[1];
    });

    test('creating a task requires a title', async ({ page }) => {
        await page.getByRole('button', { name: 'New Task' }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('button', { name: 'Create task' }).click();

        await expect(dialog.getByText('Title is required')).toBeVisible();
        await expect(dialog).toBeVisible();
    });

    test('creating a task with a title and description shows it in the list', async ({ page }) => {
        const title = await createTask(page, {
            title: uniqueName('Task'),
            description: 'Some details',
        });
        await expect(taskRow(page, title)).toBeVisible();
    });

    test('a description over 10,000 characters is rejected', async ({ page }) => {
        await page.getByRole('button', { name: 'New Task' }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByPlaceholder('Task title').fill(uniqueName('Task'));
        await dialog.locator('[contenteditable="true"]').fill('a'.repeat(10001));
        await dialog.getByRole('button', { name: 'Create task' }).click();

        await expect(dialog.getByText('Description cannot exceed 10000 characters.')).toBeVisible();
        await expect(dialog).toBeVisible();
    });

    test('editing a task updates its title and description', async ({ page }) => {
        const title = await createTask(page);
        const newTitle = uniqueName('Renamed task');

        await taskRow(page, title).getByRole('button', { name: 'More actions' }).click();
        await page.getByRole('menuitem', { name: 'Edit' }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByPlaceholder('Task title').fill(newTitle);
        await dialog.locator('[contenteditable="true"]').fill('Updated details');
        await dialog.getByRole('button', { name: 'Save changes' }).click();
        await expect(dialog).toBeHidden();

        await expect(taskRow(page, newTitle)).toBeVisible();
        await expect(page.getByRole('link', { name: title, exact: true })).toHaveCount(0);

        await taskRow(page, newTitle).getByRole('button', { name: 'More actions' }).click();
        await page.getByRole('menuitem', { name: 'Edit' }).click();
        await expect(page.getByRole('dialog').locator('[contenteditable="true"]')).toContainText(
            'Updated details',
        );
    });

    test('changing a task status via the inline picker updates it with no error', async ({
        page,
    }) => {
        const title = await createTask(page);
        const row = taskRow(page, title);

        await row.getByRole('combobox').click();
        await page.getByRole('option', { name: 'In Progress', exact: true }).click();

        await expect(row.getByText('In Progress', { exact: true })).toBeVisible();
        await expect(page.getByText('Failed to update task status')).toHaveCount(0);
    });

    test('a task with a real status shows it in the server-rendered HTML, not "No status"', async ({
        page,
    }) => {
        const title = await createTask(page);
        const row = taskRow(page, title);

        await row.getByRole('combobox').click();
        await page.getByRole('option', { name: 'In Progress', exact: true }).click();
        await expect(row.getByText('In Progress', { exact: true })).toBeVisible();

        // Bypasses the client/hydration entirely - proves the status is in the raw SSR HTML itself.
        const html = await (await page.request.get(page.url())).text();
        expect(html).toContain('In Progress');
        expect(html).not.toContain('No status');
    });

    test('completing a task with an incomplete subtask cascades after confirmation', async ({
        page,
    }) => {
        const parentTitle = await createTask(page);
        const childTitle = await addSubtask(page, taskRow(page, parentTitle));

        // Default viewport is mobile-sized, where the row's checkbox is hidden - go through the 3-dot menu.
        await taskRow(page, parentTitle).getByRole('button', { name: 'More actions' }).click();
        await page.getByRole('menuitem', { name: 'Mark as complete' }).click();
        await expect(page.getByText(`Mark “${parentTitle}” complete?`)).toBeVisible();
        await expect(page.getByText('This will also mark 1 subtask as complete.')).toBeVisible();
        await page.getByRole('button', { name: 'Mark complete' }).click();

        // Checks status text, not the menu - reopening it right after a dialog closes is flaky (see e2e-test-quality.md).
        await expect(taskRow(page, parentTitle).getByText('Done', { exact: true })).toBeVisible();
        await expect(taskRow(page, childTitle).getByText('Done', { exact: true })).toBeVisible();
    });

    test('reopening a completed task with a completed subtask cascades after confirmation', async ({
        page,
    }) => {
        const parentTitle = await createTask(page);
        const childTitle = await addSubtask(page, taskRow(page, parentTitle));

        // Default viewport is mobile-sized, where the row's checkbox is hidden - go through the 3-dot menu.
        await taskRow(page, parentTitle).getByRole('button', { name: 'More actions' }).click();
        await page.getByRole('menuitem', { name: 'Mark as complete' }).click();
        await page.getByRole('button', { name: 'Mark complete' }).click();
        await expect(taskRow(page, parentTitle).getByText('Done', { exact: true })).toBeVisible();
        // The confirm dialog's close animation must finish before the dropdown trigger below will reopen it.
        await expect(page.getByText(`Mark “${parentTitle}” complete?`)).toBeHidden();

        await taskRow(page, parentTitle).getByRole('button', { name: 'More actions' }).click();
        await page.getByRole('menuitem', { name: 'Mark as incomplete' }).click();
        await expect(page.getByText(`Mark “${parentTitle}” incomplete?`)).toBeVisible();
        await expect(page.getByText('This will also mark 1 subtask as incomplete.')).toBeVisible();
        await page.getByRole('button', { name: 'Mark incomplete' }).click();

        // Checks status text, not the menu - reopening it right after a dialog closes is flaky (see e2e-test-quality.md).
        await expect(taskRow(page, parentTitle).getByText('To Do', { exact: true })).toBeVisible();
        await expect(taskRow(page, childTitle).getByText('To Do', { exact: true })).toBeVisible();
    });

    test('moving a subtask via "Move to..." relocates it, and promotion returns it to root', async ({
        page,
    }) => {
        const originalParentTitle = await createTask(page);
        const moveTargetTitle = await createTask(page);
        const subtask = await addSubtask(page, taskRow(page, originalParentTitle));

        await taskRow(page, subtask).getByRole('button', { name: 'More actions' }).click();
        await page.getByRole('menuitem', { name: 'Move to...' }).click();
        await expect(page.getByRole('heading', { name: 'Move to...' })).toBeVisible();
        await page.getByRole('button', { name: moveTargetTitle, exact: true }).click();
        await expect(page.getByText('Task moved')).toBeVisible();

        // moveTargetTitle had no children before the move, so its row still defaults to collapsed.
        await taskRow(page, moveTargetTitle)
            .getByRole('button', { name: 'Expand subtasks' })
            .click();

        await taskRow(page, subtask).getByRole('button', { name: 'More actions' }).click();
        await expect(page.getByRole('menuitem', { name: 'Promote to sibling' })).toBeVisible();
        await page.getByRole('menuitem', { name: 'Promote to sibling' }).click();
        await expect(page.getByText('Task moved')).toBeVisible();

        await taskRow(page, subtask).getByRole('button', { name: 'More actions' }).click();
        await expect(page.getByRole('menuitem', { name: 'Promote to sibling' })).toHaveCount(0);
        await page.keyboard.press('Escape');
    });

    test('duplicating a task copies it and its subtree', async ({ page }) => {
        const parentTitle = await createTask(page);
        const childTitle = await addSubtask(page, taskRow(page, parentTitle));

        await taskRow(page, parentTitle).getByRole('button', { name: 'More actions' }).click();
        await page.getByRole('menuitem', { name: 'Duplicate' }).click();
        await expect(page.getByText('Task duplicated')).toBeVisible();

        const duplicateTitle = `${parentTitle} (copy)`;
        const duplicateRow = taskRow(page, duplicateTitle);
        await expect(duplicateRow).toBeVisible();
        await duplicateRow.getByRole('button', { name: 'Expand subtasks' }).click();

        await expect(page.getByRole('link', { name: childTitle, exact: true })).toHaveCount(2);
    });

    test("a subtask checkbox is enabled in the task detail page's server-rendered HTML on first paint", async ({
        page,
    }) => {
        const parentTitle = await createTask(page);
        const childTitle = await addSubtask(page, taskRow(page, parentTitle));

        await taskRow(page, parentTitle)
            .getByRole('link', { name: parentTitle, exact: true })
            .click();
        await page.waitForURL(/\/tasks\//);

        // Bypasses the client/hydration entirely - proves the checkbox is enabled in the raw SSR HTML.
        const html = await (await page.request.get(page.url())).text();
        const escapedTitle = childTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const checkboxTag = html.match(
            new RegExp(`<input[^>]*aria-label="Mark &quot;${escapedTitle}&quot; complete"[^>]*>`),
        );
        expect(checkboxTag).not.toBeNull();
        expect(checkboxTag[0]).not.toContain('disabled');
    });

    test('deleting a task with no children removes it', async ({ page }) => {
        const title = await createTask(page);

        await taskRow(page, title).getByRole('button', { name: 'More actions' }).click();
        await page.getByRole('menuitem', { name: 'Delete' }).click();
        await expect(page.getByText(`Delete “${title}”?`)).toBeVisible();
        await expect(page.getByText('This cannot be undone.')).toBeVisible();
        await page.getByRole('button', { name: 'Delete' }).click();

        await expect(page.getByText('Task deleted')).toBeVisible();
        await expect(page.getByRole('link', { name: title, exact: true })).toHaveCount(0);
    });

    test('deleting a task with children can move the children to its own parent', async ({
        page,
    }) => {
        const parentTitle = await createTask(page);
        const childTitle = await addSubtask(page, taskRow(page, parentTitle));

        await taskRow(page, parentTitle).getByRole('button', { name: 'More actions' }).click();
        await page.getByRole('menuitem', { name: 'Delete' }).click();
        await expect(
            page.getByText('This task has 1 subtask. What should happen to it?'),
        ).toBeVisible();
        await page.getByRole('button', { name: 'Move subtasks to parent' }).click();

        await expect(page.getByText('Task deleted')).toBeVisible();
        await expect(page.getByRole('link', { name: parentTitle, exact: true })).toHaveCount(0);
        await expect(taskRow(page, childTitle)).toBeVisible();
    });

    test('deleting a task with children can delete the whole subtree', async ({ page }) => {
        const parentTitle = await createTask(page);
        const childTitle = await addSubtask(page, taskRow(page, parentTitle));

        await taskRow(page, parentTitle).getByRole('button', { name: 'More actions' }).click();
        await page.getByRole('menuitem', { name: 'Delete' }).click();
        await page.getByRole('button', { name: 'Delete everything' }).click();

        await expect(page.getByText('Task deleted')).toBeVisible();
        await expect(page.getByRole('link', { name: parentTitle, exact: true })).toHaveCount(0);
        await expect(page.getByRole('link', { name: childTitle, exact: true })).toHaveCount(0);
    });

    // Duplicate's own max-depth guard is unreachable via the UI - see docs/e2e-test-quality.md #13.
    test('a task at the maximum nesting depth cannot get another subtask', async ({ page }) => {
        const root = await createTask(page);
        const child = await addSubtask(page, taskRow(page, root));
        const grandchild = await addSubtask(page, taskRow(page, child));

        await taskRow(page, grandchild).getByRole('button', { name: 'More actions' }).click();
        await expect(page.getByRole('menuitem', { name: 'Add Subtask' })).toBeDisabled();
        await page.keyboard.press('Escape');
    });

    test('a recurring task computes its next occurrence on creation', async ({ page }) => {
        const title = await createTask(page, { title: uniqueName('Task'), recurring: true });
        await expect(taskRow(page, title).getByText('Recurring')).toBeVisible();

        const response = await page.request.get(`/api/tasks?list_id=${listId}`);
        const tasks = await response.json();
        const created = tasks.find((task) => task.title === title);

        expect(created.is_recurring).toBe(true);
        expect(created.next_occurrence).not.toBeNull();
        expect(new Date(created.next_occurrence).getTime()).toBeGreaterThan(Date.now());
    });
});
