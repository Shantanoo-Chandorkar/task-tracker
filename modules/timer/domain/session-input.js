import { sanitizeString, checkMaxLength } from '@/lib/validation';
import {
    TIME_SESSION_SUBJECT_INVALID,
    TIME_SESSION_LABEL_TOO_LONG,
    TIME_SESSION_ALREADY_COMPLETED,
    TIME_SESSION_STATUS_INVALID,
} from '@/modules/timer/errors';
import { computeElapsedSeconds } from './session-clock';

const LABEL_MAX_LENGTH = 200;

/**
 * Checks a session's subject: at most one of a habit or a task (mirrors the DB's own CHECK).
 *
 * @param {{ habitId?: unknown, taskId?: unknown }} subject - Subject fields sent by the client.
 * @returns {{ habitId: string|null, taskId: string|null, error?: undefined, code?: undefined } |
 *   { habitId?: undefined, taskId?: undefined, error: string, code: string }} The resolved subject,
 *   or why it was rejected.
 */
export function checkSessionSubject({ habitId, taskId }) {
    const hasHabit = habitId !== undefined && habitId !== null;
    const hasTask = taskId !== undefined && taskId !== null;
    if (hasHabit && hasTask) {
        return {
            error: 'A session can be linked to a habit or a task, not both',
            code: TIME_SESSION_SUBJECT_INVALID,
        };
    }
    if (hasHabit) {
        if (typeof habitId !== 'string') {
            return { error: 'Habit id is invalid', code: TIME_SESSION_SUBJECT_INVALID };
        }
        return { habitId, taskId: null };
    }
    if (hasTask) {
        if (typeof taskId !== 'string') {
            return { error: 'Task id is invalid', code: TIME_SESSION_SUBJECT_INVALID };
        }
        return { habitId: null, taskId };
    }
    return { habitId: null, taskId: null };
}

/**
 * Cleans a session's free-text label and checks it is short enough.
 *
 * @param {unknown} rawLabel - Label as sent by the client.
 * @returns {{ label: string|null, error?: undefined, code?: undefined } |
 *   { label?: undefined, error: string, code: string }} The cleaned label (null when empty), or
 *   why it was rejected.
 */
export function checkSessionLabel(rawLabel) {
    const label = sanitizeString(rawLabel, true);
    const lengthFailure = checkMaxLength(
        label,
        LABEL_MAX_LENGTH,
        'Label',
        TIME_SESSION_LABEL_TOO_LONG,
    );
    if (lengthFailure) return lengthFailure;
    return { label: label || null };
}

/**
 * Whether a session has no subject - just a label, never a fake task row (decision 13).
 *
 * @param {{ habit_id: string|null, task_id: string|null }} session - The session row.
 * @returns {boolean} True when the session is standalone.
 */
function isStandaloneSession(session) {
    return session.habit_id == null && session.task_id == null;
}

/**
 * Decides whether completing a session updates its row or deletes it outright.
 * A standalone session is deleted - no feature reads one and none is planned.
 * A habit/task-linked session is kept instead, for Analytics' total-tracked-time KPI.
 *
 * @param {{ habit_id: string|null, task_id: string|null, status: string, accumulated_seconds: number,
 *   last_resumed_at: string|null }} session - The session row.
 * @param {Date} now - The instant the session is being completed at.
 * @returns {{ action: 'delete' } | { action: 'update', updates: Record<string, any> }} What the
 *   caller should do to the row.
 */
export function resolveSessionCompletion(session, now) {
    if (isStandaloneSession(session)) return { action: 'delete' };
    return {
        action: 'update',
        updates: {
            status: 'completed',
            completed_at: now.toISOString(),
            accumulated_seconds: computeElapsedSeconds(session, now),
            last_resumed_at: null,
        },
    };
}

const ALREADY_COMPLETED_FAILURE = {
    error: 'This session has already been completed',
    code: TIME_SESSION_ALREADY_COMPLETED,
};

/**
 * Checks a session can be paused - only a running session can be, and never once completed.
 *
 * @param {{ status: string }} session - The session row.
 * @returns {{ error: string, code: string }|null} The refusal, or null when pausing is allowed.
 */
export function checkCanPause(session) {
    if (session.status === 'completed') return ALREADY_COMPLETED_FAILURE;
    if (session.status !== 'running') {
        return { error: 'Only a running session can be paused', code: TIME_SESSION_STATUS_INVALID };
    }
    return null;
}

/**
 * Checks a session can be resumed - only a paused session can be, and never once completed.
 *
 * @param {{ status: string }} session - The session row.
 * @returns {{ error: string, code: string }|null} The refusal, or null when resuming is allowed.
 */
export function checkCanResume(session) {
    if (session.status === 'completed') return ALREADY_COMPLETED_FAILURE;
    if (session.status !== 'paused') {
        return { error: 'Only a paused session can be resumed', code: TIME_SESSION_STATUS_INVALID };
    }
    return null;
}

/**
 * Checks a session can be completed - refused only once it already has been.
 *
 * @param {{ status: string }} session - The session row.
 * @returns {{ error: string, code: string }|null} The refusal, or null when completing is allowed.
 */
export function checkCanComplete(session) {
    if (session.status === 'completed') return ALREADY_COMPLETED_FAILURE;
    return null;
}
