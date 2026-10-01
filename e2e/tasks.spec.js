import { test, expect, loginAs } from './fixtures/test.js';
import {
    uniqueName,
    createSpace,
    createList,
    createTask,
    addSubtask,
    taskRow,
    waitForCreatedToastsToClear,
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

    test('clicking outside the task form dialog does not close it', async ({ page }) => {
        await page.getByRole('button', { name: 'New Task' }).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();

        await page.locator('[data-slot="dialog-overlay"], [data-slot="sheet-overlay"]').click({
            position: { x: 5, y: 5 },
        });
        await expect(dialog).toBeVisible();
    });

    test('clicking outside the "Move to..." sheet closes it', async ({ page }) => {
        const parentTitle = await createTask(page);
        await createTask(page);
        const subtask = await addSubtask(page, taskRow(page, parentTitle));

        await taskRow(page, subtask).getByRole('button', { name: 'More actions' }).click();
        await page.getByRole('menuitem', { name: 'Move to...' }).click();
        const moveSheet = page.getByRole('dialog', { name: 'Move to...' });
        await expect(moveSheet).toBeVisible();

        // The sheet's own content sits over the bottom ~70vh - the overlay is only reachable near the top.
        await page.locator('[data-slot="sheet-overlay"]').click({ position: { x: 200, y: 20 } });
        await expect(moveSheet).toBeHidden();
    });

    test('"Move to..." keeps siblings under their real parent and disables only the direct parent', async ({
        page,
    }) => {
        const parentTitle = await createTask(page);
        const movingTitle = await addSubtask(page, taskRow(page, parentTitle));
        const siblingTitle = await addSubtask(page, taskRow(page, parentTitle));

        await taskRow(page, movingTitle).getByRole('button', { name: 'More actions' }).click();
        await page.getByRole('menuitem', { name: 'Move to...' }).click();
        const moveSheet = page.getByRole('dialog', { name: 'Move to...' });

        await expect(moveSheet.getByText('Current parent')).toBeVisible();
        await expect(moveSheet.getByRole('button', { name: parentTitle, exact: true })).toHaveCount(
            0,
        );
        // Everything starts collapsed, so the sibling is hidden until its real parent is opened.
        await expect(
            moveSheet.getByRole('button', { name: siblingTitle, exact: true }),
        ).toHaveCount(0);

        await moveSheet.getByRole('button', { name: `Expand ${parentTitle}` }).click();
        await expect(
            moveSheet.getByRole('button', { name: siblingTitle, exact: true }),
        ).toBeVisible();

        await moveSheet.getByRole('button', { name: `Collapse ${parentTitle}` }).click();
        await expect(
            moveSheet.getByRole('button', { name: siblingTitle, exact: true }),
        ).toHaveCount(0);
    });

    test('in "Move to...", the empty space beside a title toggles it and only the title moves the task', async ({
        page,
    }) => {
        const parentTitle = await createTask(page);
        const movingTitle = await addSubtask(page, taskRow(page, parentTitle));
        const siblingTitle = await addSubtask(page, taskRow(page, parentTitle));
        await waitForCreatedToastsToClear(page);
        const targetTitle = await createTask(page);
        const targetChildTitle = await addSubtask(page, taskRow(page, targetTitle));
        await waitForCreatedToastsToClear(page);

        await taskRow(page, movingTitle).getByRole('button', { name: 'More actions' }).click();
        await page.getByRole('menuitem', { name: 'Move to...' }).click();
        const moveSheet = page.getByRole('dialog', { name: 'Move to...' });

        // `has` is matched inside each row, so it must be rooted at the page, not at moveSheet.
        // The chevron's name flips between Expand and Collapse, so the row locator must accept both.
        const getToggleRow = (title) =>
            moveSheet.locator('div.min-h-11', {
                has: page.getByRole('button', { name: new RegExp(`^(Expand|Collapse) ${title}$`) }),
            });
        const targetRow = getToggleRow(targetTitle);
        const targetRowBox = await targetRow.boundingBox();
        const emptySpacePosition = { x: targetRowBox.width - 8, y: targetRowBox.height / 2 };

        await targetRow.click({ position: emptySpacePosition });
        await expect(
            moveSheet.getByRole('button', { name: targetChildTitle, exact: true }),
        ).toBeVisible();
        await expect(page.getByText('Task moved')).toHaveCount(0);

        await targetRow.click({ position: emptySpacePosition });
        await expect(
            moveSheet.getByRole('button', { name: targetChildTitle, exact: true }),
        ).toHaveCount(0);

        // The disabled current parent has no select button, but its empty space must still toggle it.
        const parentRow = getToggleRow(parentTitle);
        const parentRowBox = await parentRow.boundingBox();
        await parentRow.click({
            position: { x: parentRowBox.width - 8, y: parentRowBox.height / 2 },
        });
        await expect(
            moveSheet.getByRole('button', { name: siblingTitle, exact: true }),
        ).toBeVisible();
    });

    test('"Move to..." can move a task under a nested subtask by expanding the accordion', async ({
        page,
    }) => {
        const topTitle = await createTask(page);
        const nestedTitle = await addSubtask(page, taskRow(page, topTitle));
        const movingTitle = await createTask(page);

        await taskRow(page, movingTitle).getByRole('button', { name: 'More actions' }).click();
        await page.getByRole('menuitem', { name: 'Move to...' }).click();
        const moveSheet = page.getByRole('dialog', { name: 'Move to...' });

        // The nested subtask sits at depth 1, so the moved task lands at depth 2: the deepest allowed level.
        await moveSheet.getByRole('button', { name: `Expand ${topTitle}` }).click();
        await moveSheet.getByRole('button', { name: nestedTitle, exact: true }).click();
        await expect(page.getByText('Task moved')).toBeVisible();

        await taskRow(page, nestedTitle).getByRole('button', { name: 'Expand subtasks' }).click();
        await expect(page.getByRole('link', { name: movingTitle, exact: true })).toBeVisible();
    });

    test('"Move to..." disables targets that would exceed the maximum nesting depth', async ({
        page,
    }) => {
        const topTitle = await createTask(page);
        const middleTitle = await addSubtask(page, taskRow(page, topTitle));
        const bottomTitle = await addSubtask(page, taskRow(page, middleTitle));
        await waitForCreatedToastsToClear(page);
        const movingTitle = await createTask(page);

        await taskRow(page, movingTitle).getByRole('button', { name: 'More actions' }).click();
        await page.getByRole('menuitem', { name: 'Move to...' }).click();
        const moveSheet = page.getByRole('dialog', { name: 'Move to...' });

        await moveSheet.getByRole('button', { name: `Expand ${topTitle}` }).click();
        await moveSheet.getByRole('button', { name: `Expand ${middleTitle}` }).click();

        // The bottom task is already at the deepest level, so nothing can move under it.
        await expect(
            moveSheet.getByRole('button', { name: middleTitle, exact: true }),
        ).toBeVisible();
        await expect(moveSheet.getByRole('button', { name: bottomTitle, exact: true })).toHaveCount(
            0,
        );
        await expect(moveSheet.getByText('Too deep')).toBeVisible();

        await moveSheet.getByRole('searchbox', { name: 'Search tasks' }).fill(bottomTitle);
        await expect(moveSheet.getByText('No matching tasks')).toBeVisible();
    });

    test('searching in "Move to..." finds a nested task with its path and moves the task there', async ({
        page,
    }) => {
        const grandparentTitle = await createTask(page);
        const nestedTitle = await addSubtask(page, taskRow(page, grandparentTitle));
        const movingTitle = await createTask(page);

        await taskRow(page, movingTitle).getByRole('button', { name: 'More actions' }).click();
        await page.getByRole('menuitem', { name: 'Move to...' }).click();
        const moveSheet = page.getByRole('dialog', { name: 'Move to...' });

        await moveSheet.getByRole('searchbox', { name: 'Search tasks' }).fill(nestedTitle);
        await expect(
            moveSheet.getByRole('button', { name: nestedTitle, exact: true }),
        ).toBeVisible();
        await expect(moveSheet.getByText(`Main List > ${grandparentTitle}`)).toBeVisible();
        // Results replace the accordion, so the collapsed parent row is gone while searching.
        await expect(
            moveSheet.getByRole('button', { name: `Expand ${grandparentTitle}` }),
        ).toHaveCount(0);

        await moveSheet.getByRole('button', { name: nestedTitle, exact: true }).click();
        await expect(page.getByText('Task moved')).toBeVisible();
    });

    test('"Move to..." search shows an empty message, and clearing it restores the accordion', async ({
        page,
    }) => {
        const parentTitle = await createTask(page);
        await addSubtask(page, taskRow(page, parentTitle));
        const movingTitle = await createTask(page);

        await taskRow(page, movingTitle).getByRole('button', { name: 'More actions' }).click();
        await page.getByRole('menuitem', { name: 'Move to...' }).click();
        const moveSheet = page.getByRole('dialog', { name: 'Move to...' });
        const searchBox = moveSheet.getByRole('searchbox', { name: 'Search tasks' });

        await searchBox.fill('no-task-has-this-title');
        await expect(moveSheet.getByText('No matching tasks')).toBeVisible();

        await searchBox.clear();
        await expect(moveSheet.getByText('No matching tasks')).toHaveCount(0);
        await expect(
            moveSheet.getByRole('button', { name: `Expand ${parentTitle}` }),
        ).toBeVisible();
    });

    test('clicking the empty space between a title and "More actions" toggles its subtasks', async ({
        page,
    }) => {
        const parentTitle = await createTask(page);
        const childTitle = await addSubtask(page, taskRow(page, parentTitle));
        const childLink = page.getByRole('link', { name: childTitle, exact: true });
        // Adding a subtask expands its parent, so the child starts visible.
        await expect(childLink).toBeVisible();

        const parentRow = taskRow(page, parentTitle);
        const titleBox = await parentRow
            .getByRole('link', { name: parentTitle, exact: true })
            .boundingBox();
        const actionsBox = await parentRow
            .getByRole('button', { name: 'More actions' })
            .boundingBox();
        const gapX = (titleBox.x + titleBox.width + actionsBox.x) / 2;
        const gapY = titleBox.y + titleBox.height / 2;

        await page.mouse.click(gapX, gapY);
        await expect(childLink).toBeHidden();

        await page.mouse.click(gapX, gapY);
        await expect(childLink).toBeVisible();
    });

    test('tag pills and the add-tag button are as tall as the Status select in the task form', async ({
        page,
    }) => {
        const title = await createTask(page);
        await taskRow(page, title).getByRole('button', { name: 'More actions' }).click();
        await page.getByRole('menuitem', { name: 'Edit' }).click();
        const dialog = page.getByRole('dialog');

        await dialog.getByRole('button', { name: 'Tag', exact: true }).click();
        await page.getByPlaceholder('Find or create a tag').fill('Heights');
        await page.getByRole('option', { name: 'Create "Heights"' }).click();
        const tagPill = dialog.locator('[data-slot="badge"]', { hasText: 'Heights' });
        await expect(tagPill).toBeVisible();

        const statusHeight = (
            await dialog.locator('[data-slot="select-trigger"]').first().boundingBox()
        ).height;
        const pillHeight = (await tagPill.boundingBox()).height;
        const addButtonHeight = (
            await dialog.getByRole('button', { name: 'Tag', exact: true }).boundingBox()
        ).height;

        expect(pillHeight).toBe(statusHeight);
        expect(addButtonHeight).toBe(statusHeight);
    });

    test('a task created with "Put on priority" starts prioritised', async ({ page }) => {
        const title = await createTask(page, { isPrioritised: true });

        // The row's star is desktop-only, so the menu label is the check that works on both viewports.
        await taskRow(page, title).getByRole('button', { name: 'More actions' }).click();
        await expect(page.getByRole('menuitem', { name: 'Remove from priority' })).toBeVisible();
        await page.keyboard.press('Escape');
    });

    test('priority can be switched on and off from the edit form', async ({ page }) => {
        const title = await createTask(page);

        await taskRow(page, title).getByRole('button', { name: 'More actions' }).click();
        await page.getByRole('menuitem', { name: 'Edit' }).click();
        await page.getByRole('dialog').getByLabel('Put on priority').check();
        await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
        await expect(page.getByRole('dialog')).toBeHidden();

        await taskRow(page, title).getByRole('button', { name: 'More actions' }).click();
        await expect(page.getByRole('menuitem', { name: 'Remove from priority' })).toBeVisible();
        await page.getByRole('menuitem', { name: 'Edit' }).click();
        const editDialog = page.getByRole('dialog');
        await expect(editDialog.getByLabel('Put on priority')).toBeChecked();
        await editDialog.getByLabel('Put on priority').uncheck();
        await editDialog.getByRole('button', { name: 'Save changes' }).click();
        await expect(editDialog).toBeHidden();

        await taskRow(page, title).getByRole('button', { name: 'More actions' }).click();
        await expect(page.getByRole('menuitem', { name: 'Put on priority' })).toBeVisible();
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

    test('pills sit below the title and never overflow the row, at every depth', async ({
        page,
    }) => {
        const parentTitle = await createTask(page, { title: uniqueName('Task'), recurring: true });
        const childTitle = await addSubtask(page, taskRow(page, parentTitle));

        for (const title of [parentTitle, childTitle]) {
            const row = taskRow(page, title);
            const titleBox = await row
                .getByRole('link', { name: title, exact: true })
                .boundingBox();
            const statusBox = await row.getByRole('combobox').boundingBox();
            const rowBox = await row.boundingBox();

            // Status is the row's last control, so it must end inside the row - never past its right edge.
            expect(statusBox.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height);
            expect(statusBox.x + statusBox.width).toBeLessThanOrEqual(rowBox.x + rowBox.width);
        }

        const pillBox = await taskRow(page, parentTitle)
            .getByRole('button', { name: 'Weekly', exact: true })
            .boundingBox();
        const parentTitleBox = await taskRow(page, parentTitle)
            .getByRole('link', { name: parentTitle, exact: true })
            .boundingBox();
        expect(pillBox.y).toBeGreaterThanOrEqual(parentTitleBox.y + parentTitleBox.height);
    });

    test('a recurring task computes its next occurrence on creation', async ({ page }) => {
        const title = await createTask(page, { title: uniqueName('Task'), recurring: true });
        const frequencyPill = taskRow(page, title).getByRole('button', {
            name: 'Weekly',
            exact: true,
        });
        await expect(frequencyPill).toBeVisible();

        await frequencyPill.click();
        await expect(page.getByRole('heading', { name: 'Repeats', exact: true })).toBeVisible();
        await expect(page.getByText('every week', { exact: true })).toBeVisible();
        await page.keyboard.press('Escape');

        const response = await page.request.get(`/api/tasks?list_id=${listId}`);
        const tasks = await response.json();
        const created = tasks.find((task) => task.title === title);

        expect(created.is_recurring).toBe(true);
        expect(created.next_occurrence).not.toBeNull();
        expect(new Date(created.next_occurrence).getTime()).toBeGreaterThan(Date.now());
    });
});
