import { computeNextOccurrence } from '@/lib/tasks/recurrence';
import { TASK_INVALID_PRIORITY } from '@/lib/error-codes';
import { sanitizeString, checkMaxLength, checkIsBoolean, sanitizeRichText } from '@/lib/validation';

const TITLE_MAX_LENGTH = 200;
const DESCRIPTION_MAX_LENGTH = 10000;

// Explicit allowlist, not { ...fields } - an unlisted field must never reach the update.
const UPDATABLE_FIELD_NAMES = [
    'title',
    'description',
    'status_id',
    'due_date',
    'sublist_id',
    'is_prioritised',
    'is_recurring',
    'recurrence_rule',
];

/**
 * Cleans a task title and checks it is present and short enough.
 *
 * @param {unknown} rawTitle - Title as sent by the client
 * @returns {{ title: string }|{ error: string }} The cleaned title, or why it was rejected
 */
export function checkTaskTitle(rawTitle) {
    const title = sanitizeString(rawTitle, true);
    if (!title) return { error: 'Title is required' };
    const lengthError = checkMaxLength(title, TITLE_MAX_LENGTH, 'Title');
    if (lengthError) return { error: lengthError.error };
    return { title };
}

/**
 * Cleans a rich-text description and checks it is short enough.
 *
 * @param {unknown} rawDescription - Description HTML as sent by the client
 * @returns {{ description: string|null }|{ error: string }} The safe HTML (null when empty), or why it was rejected
 */
export function checkTaskDescription(rawDescription) {
    const description = sanitizeRichText(rawDescription);
    const lengthError = checkMaxLength(description, DESCRIPTION_MAX_LENGTH, 'Description');
    if (lengthError) return { error: lengthError.error };
    return { description: description || null };
}

/**
 * Rejects a priority flag that is not a real boolean.
 *
 * @param {unknown} isPrioritised - Value sent by the client
 * @returns {{ error: string, code: string }|null} The refusal, or null when valid
 */
export function checkPriorityFlag(isPrioritised) {
    return checkIsBoolean(isPrioritised, 'Priority', TASK_INVALID_PRIORITY);
}

/**
 * Picks the allowlisted fields the client actually sent (an omitted field stays out of the update).
 *
 * @param {object} fields - Partial task fields as sent by the client
 * @returns {object} Only the allowlisted fields whose value is not undefined
 */
export function pickTaskUpdates(fields) {
    const updates = {};
    for (const fieldName of UPDATABLE_FIELD_NAMES) {
        if (fields[fieldName] !== undefined) updates[fieldName] = fields[fieldName];
    }
    return updates;
}

/**
 * Computes when a recurring task is next due, as the ISO string the database stores.
 *
 * @param {object} recurrenceRule - Stored recurrence rule
 * @param {number} [spawnedCount] - Copies already made from this task
 * @returns {string|null} ISO timestamp, or null when no future occurrence exists
 */
export function nextOccurrenceIso(recurrenceRule, spawnedCount = 0) {
    const nextDate = computeNextOccurrence(recurrenceRule, spawnedCount);
    return nextDate ? nextDate.toISOString() : null;
}
