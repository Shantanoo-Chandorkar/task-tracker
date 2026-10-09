import { recurrenceRulesMatch } from '@/lib/tasks/recurrence';

// The fields the edit dialog writes, with the name the user sees; each says how to tell that it changed.
const EDITABLE_FIELDS = [
    { label: 'Title', hasChanged: (before, after) => (before.title ?? '') !== (after.title ?? '') },
    {
        label: 'Description',
        hasChanged: (before, after) => (before.description ?? '') !== (after.description ?? ''),
    },
    {
        label: 'Status',
        hasChanged: (before, after) => (before.status_id ?? null) !== (after.status_id ?? null),
    },
    {
        label: 'Due date',
        hasChanged: (before, after) => (before.due_date ?? null) !== (after.due_date ?? null),
    },
    {
        label: 'Priority',
        hasChanged: (before, after) =>
            Boolean(before.is_prioritised) !== Boolean(after.is_prioritised),
    },
    {
        label: 'Repeat',
        hasChanged: (before, after) =>
            Boolean(before.is_recurring) !== Boolean(after.is_recurring) ||
            !recurrenceRulesMatch(before.recurrence_rule, after.recurrence_rule),
    },
];

/**
 * Checks that a client-sent version stamp is a real timestamp string, before it reaches a query.
 *
 * @param {unknown} versionStamp - The `updated_at` value the client says it loaded
 * @returns {boolean} True only for a string that parses as a date
 */
export function isValidVersionStamp(versionStamp) {
    return typeof versionStamp === 'string' && !Number.isNaN(Date.parse(versionStamp));
}

/**
 * Names the edit-dialog fields that differ between the task the user opened and the task as it is now.
 *
 * @param {object} openedTask - The task as the dialog loaded it
 * @param {object} currentTask - The task as it is stored now
 * @returns {string[]} Display names of the changed fields, empty when only something outside the dialog moved
 */
export function describeTaskChanges(openedTask, currentTask) {
    return EDITABLE_FIELDS.filter(({ hasChanged }) => hasChanged(openedTask, currentTask)).map(
        ({ label }) => label,
    );
}

/**
 * Words the message shown when a save is refused because the task changed after the dialog opened.
 *
 * @param {string[]} changedFieldNames - Result of `describeTaskChanges`
 * @returns {string} Message that says what changed (when known) and what saving again will do
 */
export function buildEditConflictMessage(changedFieldNames) {
    const whatChanged =
        changedFieldNames.length > 0
            ? `Someone changed this task while you were editing: ${changedFieldNames.join(', ')}.`
            : 'This task was changed while you were editing.';
    return `${whatChanged} Your edits are kept. Save again to replace their version, or close to discard yours.`;
}
