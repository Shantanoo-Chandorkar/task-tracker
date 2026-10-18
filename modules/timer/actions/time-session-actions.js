'use server';

import { withAuthenticatedAction } from '@/lib/auth/with-authenticated-action';
import {
    readClientId,
    findOwnRowById,
    insertRowOnce,
    isUniqueViolation,
} from '@/lib/idempotent-create';
import { toGuestLimitResult } from '@/lib/guest/guest-database-errors';
import {
    checkSessionSubject,
    checkSessionLabel,
    checkCanPause,
    checkCanResume,
    checkCanComplete,
    resolveSessionCompletion,
} from '@/modules/timer/domain/session-input';
import { computeElapsedSeconds } from '@/modules/timer/domain/session-clock';
import { BlockSequence } from '@/modules/timer/domain/block-sequence';
import { toTimeSessionRateLimitResult } from '@/modules/timer/domain/time-session-rate-limit';
import {
    TIME_SESSION_ID_REQUIRED,
    TIME_SESSION_NOT_FOUND,
    TIME_SESSION_SUBJECT_INVALID,
    TIME_SESSION_STANDALONE_ALREADY_LIVE,
    TIME_SESSION_TASK_ALREADY_LIVE,
    TIME_SESSION_HABIT_ALREADY_LIVE,
    TIME_SESSION_TEMPLATE_INVALID,
    TIME_SESSION_NO_NEXT_BLOCK,
} from '@/modules/timer/errors';
import { loadTimeSessionForWrite } from '@/modules/timer/data/load-time-session-for-write';
import { loadTimerTemplateForWrite } from '@/modules/timer/data/load-timer-template-for-write';

const ID_REQUIRED_FAILURE = { error: 'Session ID is required', code: TIME_SESSION_ID_REQUIRED };
const NOT_FOUND_FAILURE = { error: 'Session not found', code: TIME_SESSION_NOT_FOUND };
const STANDALONE_ALREADY_LIVE_FAILURE = {
    error: 'You already have a running or paused standalone session - finish or discard it first',
    code: TIME_SESSION_STANDALONE_ALREADY_LIVE,
};
const TASK_ALREADY_LIVE_FAILURE = {
    error: 'This task already has a running or paused timer - finish or discard it first',
    code: TIME_SESSION_TASK_ALREADY_LIVE,
};
const HABIT_ALREADY_LIVE_FAILURE = {
    error: 'This habit already has a running or paused timer - finish or discard it first',
    code: TIME_SESSION_HABIT_ALREADY_LIVE,
};
const TEMPLATE_NOT_FOUND_FAILURE = {
    error: 'Template not found',
    code: TIME_SESSION_TEMPLATE_INVALID,
};
const NO_TEMPLATE_FAILURE = {
    error: 'This session has no template attached',
    code: TIME_SESSION_TEMPLATE_INVALID,
};
const NO_NEXT_BLOCK_FAILURE = {
    error: 'This is already the last block',
    code: TIME_SESSION_NO_NEXT_BLOCK,
};

/**
 * Checks a row id belongs to the caller - RLS already scopes every table here, so a miss means
 * the id doesn't exist or isn't theirs, either way an invalid reference.
 *
 * @param {SupabaseClient} supabase - Request-scoped Supabase client.
 * @param {string} table - 'habits', 'tasks' or 'timer_templates'.
 * @param {string} id - Id sent by the client.
 * @returns {Promise<boolean>} True when the row is visible to the caller.
 */
async function isOwnRow(supabase, table, id) {
    const { data } = await supabase.from(table).select('id').eq('id', id).maybeSingle();
    return Boolean(data);
}

/**
 * Maps a time_sessions write error to a friendly result, or a fixed generic message.
 *
 * @param {{ message?: string }} databaseError - Error from an insert, update or delete.
 * @param {string} genericError - Fallback message when the error matches no known marker.
 * @returns {{ error: string, code?: string }} The mapped, user-facing result.
 */
function toTimeSessionWriteFailure(databaseError, genericError) {
    const guestLimitResult = toGuestLimitResult(databaseError);
    if (guestLimitResult) return guestLimitResult;
    const rateLimitResult = toTimeSessionRateLimitResult(databaseError);
    if (rateLimitResult) return rateLimitResult;
    return { error: genericError };
}

/**
 * Starts a session for a habit, a task or a free-text label, optionally following a template's
 * block sequence; a client-id retry returns the first row.
 * Only a label and (since C3) a task are reachable from the UI so far - habit attachment has no
 * UI yet. The ownership checks below exist regardless, since this action is already callable.
 *
 * @param {object} fields
 * @param {string} [fields.id] - Optional client-made UUID.
 * @param {string} [fields.habitId] - Habit to attach to; at most one of habitId/taskId may be sent.
 * @param {string} [fields.taskId] - Task to attach to.
 * @param {string} [fields.label] - Free-text label, mainly for a standalone session.
 * @param {string} [fields.templateId] - Template whose blocks this session follows.
 * @returns {Promise<{ data: Record<string, any>|null, error: string|null, code?: string }>}
 */
export const startTimeSession = withAuthenticatedAction(
    '[timer] start session',
    'Unexpected error starting session',
    async (user, supabase, fields) => {
        const clientId = readClientId(fields);
        if (clientId.failure) return { data: null, ...clientId.failure };
        const replayedSession = await findOwnRowById(
            supabase,
            'time_sessions',
            clientId.id,
            'user_id',
            user.id,
        );
        if (replayedSession) return { data: replayedSession, error: null };

        const subjectCheck = checkSessionSubject({
            habitId: fields.habitId,
            taskId: fields.taskId,
        });
        if (subjectCheck.error) {
            return { data: null, error: subjectCheck.error, code: subjectCheck.code };
        }

        if (subjectCheck.habitId && !(await isOwnRow(supabase, 'habits', subjectCheck.habitId))) {
            return { data: null, error: 'Habit not found', code: TIME_SESSION_SUBJECT_INVALID };
        }
        if (subjectCheck.taskId && !(await isOwnRow(supabase, 'tasks', subjectCheck.taskId))) {
            return { data: null, error: 'Task not found', code: TIME_SESSION_SUBJECT_INVALID };
        }

        const templateId = fields.templateId ?? null;
        if (templateId !== null && typeof templateId !== 'string') {
            return { data: null, ...TEMPLATE_NOT_FOUND_FAILURE };
        }
        if (templateId && !(await isOwnRow(supabase, 'timer_templates', templateId))) {
            return { data: null, ...TEMPLATE_NOT_FOUND_FAILURE };
        }

        const labelCheck = checkSessionLabel(fields.label);
        if (labelCheck.error) return { data: null, error: labelCheck.error, code: labelCheck.code };

        const isStandalone = subjectCheck.habitId === null && subjectCheck.taskId === null;
        const startedAt = new Date().toISOString();

        const { data: createdSession, error } = await insertRowOnce(
            supabase,
            'time_sessions',
            {
                habit_id: subjectCheck.habitId,
                task_id: subjectCheck.taskId,
                label: labelCheck.label,
                template_id: templateId,
                block_index: templateId ? 0 : null,
                status: 'running',
                started_at: startedAt,
                last_resumed_at: startedAt,
                accumulated_seconds: 0,
                user_id: user.id,
            },
            { clientId: clientId.id, ownerColumn: 'user_id', userId: user.id },
        );
        if (error) {
            if (isUniqueViolation(error)) {
                if (isStandalone) return { data: null, ...STANDALONE_ALREADY_LIVE_FAILURE };
                if (subjectCheck.taskId) return { data: null, ...TASK_ALREADY_LIVE_FAILURE };
                if (subjectCheck.habitId) return { data: null, ...HABIT_ALREADY_LIVE_FAILURE };
            }
            return { data: null, ...toTimeSessionWriteFailure(error, 'Failed to start session') };
        }

        return { data: createdSession, error: null };
    },
);

/**
 * Pauses a running session, sealing its elapsed time into `accumulated_seconds`.
 *
 * @param {string} id - Session to pause.
 * @returns {Promise<{ data: Record<string, any>|null, error: string|null, code?: string }>}
 */
export const pauseTimeSession = withAuthenticatedAction(
    '[timer] pause session',
    'Unexpected error pausing session',
    async (user, supabase, id) => {
        if (!id) return { data: null, ...ID_REQUIRED_FAILURE };

        const { session, failure: loadFailure } = await loadTimeSessionForWrite(
            supabase,
            id,
            NOT_FOUND_FAILURE,
        );
        if (loadFailure) return { data: null, ...loadFailure };

        const canPauseFailure = checkCanPause(session);
        if (canPauseFailure) return { data: null, ...canPauseFailure };

        const now = new Date();
        const { data: updatedSession, error } = await supabase
            .from('time_sessions')
            .update({
                status: 'paused',
                accumulated_seconds: computeElapsedSeconds(session, now),
                last_resumed_at: null,
            })
            .eq('id', id)
            .select()
            .maybeSingle();
        if (error) {
            return { data: null, ...toTimeSessionWriteFailure(error, 'Failed to pause session') };
        }
        if (!updatedSession) return { data: null, ...NOT_FOUND_FAILURE };

        return { data: updatedSession, error: null };
    },
);

/**
 * Resumes a paused session, restarting its running segment from now.
 *
 * @param {string} id - Session to resume.
 * @returns {Promise<{ data: Record<string, any>|null, error: string|null, code?: string }>}
 */
export const resumeTimeSession = withAuthenticatedAction(
    '[timer] resume session',
    'Unexpected error resuming session',
    async (user, supabase, id) => {
        if (!id) return { data: null, ...ID_REQUIRED_FAILURE };

        const { session, failure: loadFailure } = await loadTimeSessionForWrite(
            supabase,
            id,
            NOT_FOUND_FAILURE,
        );
        if (loadFailure) return { data: null, ...loadFailure };

        const canResumeFailure = checkCanResume(session);
        if (canResumeFailure) return { data: null, ...canResumeFailure };

        const { data: updatedSession, error } = await supabase
            .from('time_sessions')
            .update({ status: 'running', last_resumed_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .maybeSingle();
        if (error) {
            return { data: null, ...toTimeSessionWriteFailure(error, 'Failed to resume session') };
        }
        if (!updatedSession) return { data: null, ...NOT_FOUND_FAILURE };

        return { data: updatedSession, error: null };
    },
);

/**
 * Completes a session - deletes it outright if standalone (decision 13), no trail kept.
 * Otherwise seals the elapsed time and marks it completed, for Analytics to read later.
 *
 * @param {string} id - Session to complete.
 * @returns {Promise<{ data: Record<string, any>|null, error: string|null, code?: string }>}
 */
export const completeTimeSession = withAuthenticatedAction(
    '[timer] complete session',
    'Unexpected error completing session',
    async (user, supabase, id) => {
        if (!id) return { data: null, ...ID_REQUIRED_FAILURE };

        const { session, failure: loadFailure } = await loadTimeSessionForWrite(
            supabase,
            id,
            NOT_FOUND_FAILURE,
        );
        if (loadFailure) return { data: null, ...loadFailure };

        const canCompleteFailure = checkCanComplete(session);
        if (canCompleteFailure) return { data: null, ...canCompleteFailure };

        const resolution = resolveSessionCompletion(session, new Date());
        if (resolution.action === 'delete') {
            const { error } = await supabase
                .from('time_sessions')
                .delete()
                .eq('id', id)
                .select()
                .maybeSingle();
            if (error) {
                return {
                    data: null,
                    ...toTimeSessionWriteFailure(error, 'Failed to complete session'),
                };
            }
            return { data: null, error: null };
        }

        const { data: updatedSession, error } = await supabase
            .from('time_sessions')
            .update(resolution.updates)
            .eq('id', id)
            .select()
            .maybeSingle();
        if (error) {
            return {
                data: null,
                ...toTimeSessionWriteFailure(error, 'Failed to complete session'),
            };
        }
        if (!updatedSession) return { data: null, ...NOT_FOUND_FAILURE };

        return { data: updatedSession, error: null };
    },
);

/**
 * Discards a stale session outright, throwing its banked time away instead of sealing it.
 * Distinct from `completeTimeSession`, which always seals whatever time is currently banked.
 *
 * @param {string} id - Session to discard.
 * @returns {Promise<{ error: string|null, code?: string }>}
 */
export const discardTimeSession = withAuthenticatedAction(
    '[timer] discard session',
    'Unexpected error discarding session',
    async (user, supabase, id) => {
        if (!id) return ID_REQUIRED_FAILURE;

        const { session, failure: loadFailure } = await loadTimeSessionForWrite(
            supabase,
            id,
            NOT_FOUND_FAILURE,
        );
        if (loadFailure) return loadFailure;

        // A completed session is already sealed history (Analytics reads it) - only a live one can be discarded.
        const notCompletedFailure = checkCanComplete(session);
        if (notCompletedFailure) return notCompletedFailure;

        const { error } = await supabase
            .from('time_sessions')
            .delete()
            .eq('id', id)
            .select()
            .maybeSingle();
        if (error) return toTimeSessionWriteFailure(error, 'Failed to discard session');

        return { error: null };
    },
    { hasData: false },
);

/**
 * Moves a templated session on to its next block. Purely a manual display bookmark - advancing
 * never touches `accumulated_seconds`/`last_resumed_at`, since the session's own clock keeps
 * running across a block change (no scheduler, decision 2).
 *
 * @param {string} id - Session to advance.
 * @returns {Promise<{ data: Record<string, any>|null, error: string|null, code?: string }>}
 */
export const advanceSessionBlock = withAuthenticatedAction(
    '[timer] advance session block',
    'Unexpected error advancing to the next block',
    async (user, supabase, id) => {
        if (!id) return { data: null, ...ID_REQUIRED_FAILURE };

        const { session, failure: loadFailure } = await loadTimeSessionForWrite(
            supabase,
            id,
            NOT_FOUND_FAILURE,
        );
        if (loadFailure) return { data: null, ...loadFailure };

        const notCompletedFailure = checkCanComplete(session);
        if (notCompletedFailure) return { data: null, ...notCompletedFailure };

        if (!session.template_id) return { data: null, ...NO_TEMPLATE_FAILURE };
        const { template, failure: templateFailure } = await loadTimerTemplateForWrite(
            supabase,
            session.template_id,
            TEMPLATE_NOT_FOUND_FAILURE,
        );
        if (templateFailure) return { data: null, ...templateFailure };

        const nextIndex = new BlockSequence(template.blocks).nextIndex(session.block_index ?? 0);
        if (nextIndex === null) return { data: null, ...NO_NEXT_BLOCK_FAILURE };

        const { data: updatedSession, error } = await supabase
            .from('time_sessions')
            .update({ block_index: nextIndex })
            .eq('id', id)
            .select()
            .maybeSingle();
        if (error) {
            return {
                data: null,
                ...toTimeSessionWriteFailure(error, 'Failed to advance to the next block'),
            };
        }
        if (!updatedSession) return { data: null, ...NOT_FOUND_FAILURE };

        return { data: updatedSession, error: null };
    },
);
