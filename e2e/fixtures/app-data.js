import { expect } from '@playwright/test';

/**
 * Generates a name unlikely to collide with another test's data - nothing in this app
 * enforces name uniqueness for spaces/lists/sublists/statuses.
 *
 * @param {string} prefix - Label to prefix the generated name with.
 * @returns {string}
 */
export function uniqueName(prefix) {
    return `${prefix} ${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Fills and submits whichever create/edit dialog is currently open, then waits for it to close.
 *
 * Space/List/Sublist/Status all share the same dialog shape (ResponsiveModal + CharLimitField).
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} fields
 * @param {string} fields.placeholder - The name input's placeholder text.
 * @param {string} fields.value - Name to type.
 * @param {string} fields.submitName - Submit button's accessible name.
 * @returns {Promise<void>}
 */
export async function submitDialog(page, { placeholder, value, submitName }) {
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder(placeholder).fill(value);
    await dialog.getByRole('button', { name: submitName }).click();
    await expect(dialog).toBeHidden();
}

/**
 * Locates a space's whole section (header, lists, Statuses panel) by its visible name.
 *
 * Lets per-space controls like "+ Add list" be scoped to the right space when several exist.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} spaceName
 * @returns {import('@playwright/test').Locator}
 */
export function spaceSection(page, spaceName) {
    return page.locator('div.rounded-xl').filter({ hasText: spaceName });
}

/**
 * Creates a space via the real /spaces UI.
 *
 * @param {import('@playwright/test').Page} page - Already on /spaces.
 * @param {string} [name] - Defaults to a generated unique name.
 * @returns {Promise<string>} The space's name.
 */
export async function createSpace(page, name = uniqueName('Space')) {
    await page.getByRole('button', { name: '+ Add space' }).click();
    await submitDialog(page, {
        placeholder: 'Space name',
        value: name,
        submitName: 'Create space',
    });
    return name;
}

/**
 * Locates a single list's own row within its space section.
 *
 * Narrower than spaceSection - both a space's outer container and its list row contain the list name.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} spaceName
 * @param {string} listName
 * @returns {import('@playwright/test').Locator}
 */
export function listRow(page, spaceName, listName) {
    return spaceSection(page, spaceName).locator('div.pl-6').filter({ hasText: listName });
}

/**
 * Creates a list under an existing space via the real /spaces UI.
 *
 * @param {import('@playwright/test').Page} page - Already on /spaces.
 * @param {string} spaceName - Name of the space to add the list under.
 * @param {string} [name] - Defaults to a generated unique name.
 * @returns {Promise<string>} The list's name.
 */
export async function createList(page, spaceName, name = uniqueName('List')) {
    await spaceSection(page, spaceName).getByRole('button', { name: '+ Add list' }).click();
    await submitDialog(page, { placeholder: 'List name', value: name, submitName: 'Create list' });
    return name;
}

/**
 * Creates a sublist via the global "Create new..." FAB, so it works even on a still-empty list.
 *
 * The inline "Create New Sublist" button doesn't exist on a fresh, empty list - see docs/e2e-test-quality.md.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} spaceName
 * @param {string} listName
 * @param {string} [name] - Defaults to a generated unique name.
 * @returns {Promise<string>} The sublist's name.
 */
export async function createSublist(page, spaceName, listName, name = uniqueName('Sublist')) {
    await page.getByRole('button', { name: 'Create new...' }).click();
    await page.getByRole('menuitem', { name: 'New Sublist' }).click();
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: `${spaceName} / ${listName}` }).click();
    await submitDialog(page, {
        placeholder: 'Sublist name',
        value: name,
        submitName: 'Create sublist',
    });
    return name;
}

/**
 * Locates a single status's own row within its space's (already-expanded) Statuses panel.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} spaceName
 * @param {string} statusName
 * @returns {import('@playwright/test').Locator}
 */
export function statusRow(page, spaceName, statusName) {
    return spaceSection(page, spaceName)
        .locator('[class*="py-2.5"]')
        .filter({ hasText: statusName });
}

/**
 * Creates a status under an existing space.
 *
 * Caller must have already expanded the Statuses panel - clicking the toggle again would close it.
 *
 * @param {import('@playwright/test').Page} page - Already on /spaces.
 * @param {string} spaceName - Name of the space to add the status under.
 * @param {string} [name] - Defaults to a generated unique name.
 * @returns {Promise<string>} The status's name.
 */
export async function createStatus(page, spaceName, name = uniqueName('Status')) {
    await spaceSection(page, spaceName).getByRole('button', { name: '+ Add status' }).click();
    await submitDialog(page, {
        placeholder: 'Status name',
        value: name,
        submitName: 'Create status',
    });
    return name;
}

/**
 * Locates a single task's own row by its exact title text - matches on the row's title link,
 * so it never accidentally matches an ancestor/descendant row that merely contains the text.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} title
 * @returns {import('@playwright/test').Locator}
 */
export function taskRow(page, title) {
    return page.locator('div.group', { has: page.getByRole('link', { name: title, exact: true }) });
}

/**
 * Opens whichever "create task" entry point is visible for the list's current state - the
 * empty-state "New Task" button on a still-empty list, or a status group's "Add Task" button
 * once at least one task already exists.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function openNewTaskDialog(page) {
    const newTaskButton = page.getByRole('button', { name: 'New Task' });
    const addTaskButton = page.getByRole('button', { name: 'Add Task' }).first();
    await newTaskButton.or(addTaskButton).click();
}

/**
 * Creates a root-level task on the currently open list page via the real task form.
 *
 * @param {import('@playwright/test').Page} page - Already on /lists/{id}.
 * @param {object} [fields]
 * @param {string} [fields.title] - Defaults to a generated unique name.
 * @param {string} [fields.description] - Typed into the rich text editor if given.
 * @param {boolean} [fields.recurring] - Checks "Recurring task" (default: weekly, no end).
 * @returns {Promise<string>} The task's title.
 */
export async function createTask(
    page,
    { title = uniqueName('Task'), description, recurring = false } = {},
) {
    await openNewTaskDialog(page);
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('Task title').fill(title);
    if (description !== undefined)
        await dialog.locator('[contenteditable="true"]').fill(description);
    if (recurring) await dialog.getByLabel('Recurring task').check();
    await dialog.getByRole('button', { name: 'Create task' }).click();
    await expect(dialog).toBeHidden();
    return title;
}

/**
 * Adds a subtask under an existing row via its "More actions" menu.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} parentRow - Row to add the subtask under.
 * @param {string} [title] - Defaults to a generated unique name.
 * @returns {Promise<string>} The subtask's title.
 */
export async function addSubtask(page, parentRow, title = uniqueName('Task')) {
    await parentRow.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Add Subtask' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('Task title').fill(title);
    await dialog.getByRole('button', { name: 'Create task' }).click();
    await expect(dialog).toBeHidden();
    return title;
}

/**
 * Locates a single sublist's own header row by its exact visible name.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} sublistName
 * @returns {import('@playwright/test').Locator}
 */
export function sublistRow(page, sublistName) {
    return page.locator('div.rounded-lg.bg-card', {
        has: page.getByText(sublistName, { exact: true }),
    });
}

/**
 * Moves a sortable row one step down via dnd-kit's keyboard sensor, deterministically -
 * a raw mouse dragTo() is timing-sensitive against dnd-kit sortables.
 *
 * @param {import('@playwright/test').Locator} row - A space/list/sublist/task row locator.
 * @returns {Promise<void>}
 */
export async function dragHandleDown(row) {
    const handle = row.getByRole('button', { name: 'Drag to reorder' });
    const page = row.page();
    // Space/Arrow/Space back-to-back outruns React's own state update and drops on itself.
    await handle.focus();
    await handle.press('Space');
    await page.waitForTimeout(150);
    await handle.press('ArrowDown');
    await page.waitForTimeout(150);
    await handle.press('Space');
}

/**
 * Requests to join a space by ID via the real "Join a space" dialog.
 *
 * @param {import('@playwright/test').Page} page - Already on /spaces.
 * @param {string} spaceId
 * @returns {Promise<void>}
 */
export async function requestToJoinViaUi(page, spaceId) {
    await page.getByRole('button', { name: 'Join a space' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('Paste the space ID').fill(spaceId);
    await dialog.getByRole('button', { name: 'Request to join' }).click();
}

/**
 * Expands an owned space's "Share this space" panel. Caller must be the only opener - the
 * toggle isn't idempotent, see docs/e2e-test-quality.md #3.
 *
 * @param {import('@playwright/test').Locator} spaceSectionLocator
 * @returns {Promise<void>}
 */
export async function openSharingPanel(spaceSectionLocator) {
    await spaceSectionLocator.getByRole('button', { name: 'Share this space' }).click();
}

/**
 * Locates a join-request or collaborator row within an owner's sharing panel by requester email.
 *
 * @param {import('@playwright/test').Locator} spaceSectionLocator
 * @param {string} email
 * @returns {import('@playwright/test').Locator}
 */
export function collaboratorRow(spaceSectionLocator, email) {
    return spaceSectionLocator.locator('div.px-3.py-2', { hasText: email });
}

/**
 * Sends a direct email invite via the owner's sharing panel, waiting for confirmation.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} spaceSectionLocator
 * @param {string} email
 * @returns {Promise<void>}
 */
export async function sendInviteViaUi(page, spaceSectionLocator, email) {
    await spaceSectionLocator.getByLabel('Invite by email').fill(email);
    await spaceSectionLocator.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('Invite sent')).toBeVisible();
}

/**
 * Locates a pending invite's own row within an owner's sharing panel by invited email.
 *
 * @param {import('@playwright/test').Locator} spaceSectionLocator
 * @param {string} email
 * @returns {import('@playwright/test').Locator}
 */
export function pendingInviteRow(spaceSectionLocator, email) {
    return spaceSectionLocator.locator('div.px-3.py-2', { hasText: email });
}

/**
 * Approves a pending join request via the owner's sharing panel, waiting for confirmation.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} spaceSectionLocator
 * @param {string} requesterEmail
 * @returns {Promise<void>}
 */
export async function approveJoinRequestViaUi(page, spaceSectionLocator, requesterEmail) {
    await collaboratorRow(spaceSectionLocator, requesterEmail)
        .getByRole('button', { name: 'Approve request' })
        .click();
    await expect(page.getByText('Request approved')).toBeVisible();
}

/**
 * Navigates to a page this same browser context already visited, bypassing the service
 * worker's stale-while-revalidate cache after a change made by a DIFFERENT context - see
 * docs/e2e-test-quality.md.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} path
 * @returns {Promise<void>}
 */
export async function gotoFreshAfterExternalChange(page, path) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    // networkidle doesn't track the SW's own background cache write - see docs/e2e-test-quality.md #7.
    await page.waitForTimeout(1000);
    await page.reload();
}

/**
 * Starts a real anonymous guest session via the login page's "Try as guest" button.
 *
 * No captcha handling needed - .env.test blanks TURNSTILE_* vars, so the widget never renders.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
export async function startGuestSession(page) {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Try as guest' }).click();
    await page.waitForURL('/');
}
