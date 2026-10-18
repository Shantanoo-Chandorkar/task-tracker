import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from './test-support/fake-supabase';

const OWNER_ID = 'user-owner';
const STRANGER_ID = 'user-stranger';
const CLIENT_ID = '3f2b1c4e-5d6a-4b7c-8d9e-0a1b2c3d4e5f';
const NOW = '2026-10-18T12:00:00.000Z';

let fake;
let tables;
let currentUserId;

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fake.client }));
vi.mock('@/lib/auth/session', () => ({
    getCurrentUser: async () => currentUserId && { id: currentUserId },
}));

/**
 * @param {string} id
 * @param {object} [overrides]
 */
function buildSessionRow(id, overrides = {}) {
    return {
        id,
        user_id: OWNER_ID,
        habit_id: null,
        task_id: null,
        label: 'Deep work',
        template_id: null,
        block_index: null,
        status: 'running',
        started_at: NOW,
        last_resumed_at: NOW,
        accumulated_seconds: 0,
        completed_at: null,
        ...overrides,
    };
}

function setUpWorld({ sessions, habits, tasks, fakeOptions } = {}) {
    tables = {
        time_sessions: sessions ?? [],
        habits: habits ?? [{ id: 'habit-1', user_id: OWNER_ID }],
        tasks: tasks ?? [{ id: 'task-1', user_id: OWNER_ID }],
    };
    fake = createFakeSupabase({ tables, getCallerId: () => currentUserId, ...fakeOptions });
}

async function timeSessionActions() {
    return import('./time-session-actions');
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    currentUserId = OWNER_ID;
    setUpWorld();
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('startTimeSession', () => {
    it('refuses a signed-out caller with the stable auth code', async () => {
        currentUserId = null;
        const { startTimeSession } = await timeSessionActions();

        expect(await startTimeSession({ label: 'Deep work' })).toMatchObject({
            data: null,
            code: 'NOT_AUTHENTICATED',
        });
    });

    it('starts a standalone session from just a label', async () => {
        const { startTimeSession } = await timeSessionActions();

        const startResult = await startTimeSession({ label: '  Deep work  ' });

        expect(startResult.error).toBeNull();
        expect(startResult.data).toMatchObject({
            habit_id: null,
            task_id: null,
            label: 'Deep work',
            status: 'running',
            accumulated_seconds: 0,
            user_id: OWNER_ID,
        });
    });

    it('rejects a habit and a task sent together', async () => {
        const { startTimeSession } = await timeSessionActions();

        expect(await startTimeSession({ habitId: 'habit-1', taskId: 'task-1' })).toMatchObject({
            data: null,
            code: 'TIME_SESSION_SUBJECT_INVALID',
        });
        expect(fake.inserts).toHaveLength(0);
    });

    it('rejects a habit id that is not the caller’s own', async () => {
        setUpWorld({ habits: [{ id: 'habit-1', user_id: STRANGER_ID }] });
        const { startTimeSession } = await timeSessionActions();

        expect(await startTimeSession({ habitId: 'habit-1' })).toMatchObject({
            data: null,
            code: 'TIME_SESSION_SUBJECT_INVALID',
        });
        expect(fake.inserts).toHaveLength(0);
    });

    it('rejects a task id that does not exist', async () => {
        const { startTimeSession } = await timeSessionActions();

        expect(await startTimeSession({ taskId: 'task-missing' })).toMatchObject({
            data: null,
            code: 'TIME_SESSION_SUBJECT_INVALID',
        });
    });

    it('starts a session linked to the caller’s own habit', async () => {
        const { startTimeSession } = await timeSessionActions();

        const startResult = await startTimeSession({ habitId: 'habit-1' });

        expect(startResult.data).toMatchObject({ habit_id: 'habit-1', task_id: null });
    });

    it('rejects a label over 200 characters', async () => {
        const { startTimeSession } = await timeSessionActions();

        expect(await startTimeSession({ label: 'a'.repeat(201) })).toMatchObject({
            data: null,
            code: 'TIME_SESSION_LABEL_TOO_LONG',
        });
    });

    it('returns the first row on a client-id retry instead of creating a second one', async () => {
        setUpWorld({ sessions: [buildSessionRow('session-1', { id: CLIENT_ID })] });
        const { startTimeSession } = await timeSessionActions();

        const startResult = await startTimeSession({ id: CLIENT_ID, label: 'Deep work' });

        expect(startResult.data.id).toBe(CLIENT_ID);
        expect(fake.inserts).toHaveLength(0);
    });

    it('turns a second standalone start into the stable already-live failure', async () => {
        setUpWorld({
            fakeOptions: { insertError: { code: '23505', message: 'duplicate key' } },
        });
        const { startTimeSession } = await timeSessionActions();

        expect(await startTimeSession({ label: 'Deep work' })).toMatchObject({
            data: null,
            code: 'TIME_SESSION_STANDALONE_ALREADY_LIVE',
        });
    });

    it('does not apply the standalone-collision mapping to a habit-linked session', async () => {
        setUpWorld({
            fakeOptions: { insertError: { code: '23505', message: 'duplicate key' } },
        });
        const { startTimeSession } = await timeSessionActions();

        const startResult = await startTimeSession({ habitId: 'habit-1' });

        expect(startResult.code).not.toBe('TIME_SESSION_STANDALONE_ALREADY_LIVE');
        expect(startResult.error).toBe('Failed to start session');
    });

    it('turns a guest limit error into the friendly guest result', async () => {
        setUpWorld({
            fakeOptions: {
                insertError: { code: 'P0001', message: 'GUEST_LIMIT_REACHED:time_sessions' },
            },
        });
        const { startTimeSession } = await timeSessionActions();

        const startResult = await startTimeSession({ label: 'Deep work' });

        expect(startResult.data).toBeNull();
        expect(startResult.error).toContain('Guest mode is limited to 50 time sessions');
    });

    it('turns a rate limit error into the friendly rate-limit result', async () => {
        setUpWorld({
            fakeOptions: {
                insertError: { message: 'TIME_SESSION_WRITE_RATE_LIMITED:minute' },
            },
        });
        const { startTimeSession } = await timeSessionActions();

        expect(await startTimeSession({ label: 'Deep work' })).toMatchObject({
            data: null,
            code: 'TIME_SESSION_RATE_LIMITED',
        });
    });

    it('hides a database failure behind a fixed message', async () => {
        setUpWorld({
            fakeOptions: { insertError: { code: 'XX000', message: 'relation exploded' } },
        });
        const { startTimeSession } = await timeSessionActions();

        expect(await startTimeSession({ label: 'Deep work' })).toEqual({
            data: null,
            error: 'Failed to start session',
        });
    });
});

describe('pauseTimeSession', () => {
    it('needs a session id', async () => {
        const { pauseTimeSession } = await timeSessionActions();

        expect(await pauseTimeSession()).toMatchObject({
            data: null,
            code: 'TIME_SESSION_ID_REQUIRED',
        });
    });

    it('refuses an unknown session', async () => {
        const { pauseTimeSession } = await timeSessionActions();

        expect(await pauseTimeSession('session-missing')).toMatchObject({
            data: null,
            code: 'TIME_SESSION_NOT_FOUND',
        });
    });

    it('pauses a running session, sealing its elapsed time', async () => {
        setUpWorld({
            sessions: [
                buildSessionRow('session-1', {
                    last_resumed_at: '2026-10-18T11:59:30.000Z',
                    accumulated_seconds: 100,
                }),
            ],
        });
        const { pauseTimeSession } = await timeSessionActions();

        const pauseResult = await pauseTimeSession('session-1');

        expect(pauseResult.data).toMatchObject({
            status: 'paused',
            accumulated_seconds: 130,
            last_resumed_at: null,
        });
    });

    it('refuses pausing a session that is already paused', async () => {
        setUpWorld({ sessions: [buildSessionRow('session-1', { status: 'paused' })] });
        const { pauseTimeSession } = await timeSessionActions();

        expect(await pauseTimeSession('session-1')).toMatchObject({
            data: null,
            code: 'TIME_SESSION_STATUS_INVALID',
        });
    });

    it('refuses pausing a completed session', async () => {
        setUpWorld({ sessions: [buildSessionRow('session-1', { status: 'completed' })] });
        const { pauseTimeSession } = await timeSessionActions();

        expect(await pauseTimeSession('session-1')).toMatchObject({
            data: null,
            code: 'TIME_SESSION_ALREADY_COMPLETED',
        });
    });
});

describe('resumeTimeSession', () => {
    it('resumes a paused session from now', async () => {
        setUpWorld({
            sessions: [buildSessionRow('session-1', { status: 'paused', last_resumed_at: null })],
        });
        const { resumeTimeSession } = await timeSessionActions();

        const resumeResult = await resumeTimeSession('session-1');

        expect(resumeResult.data).toMatchObject({ status: 'running', last_resumed_at: NOW });
    });

    it('refuses resuming a session that is already running', async () => {
        setUpWorld({ sessions: [buildSessionRow('session-1', { status: 'running' })] });
        const { resumeTimeSession } = await timeSessionActions();

        expect(await resumeTimeSession('session-1')).toMatchObject({
            data: null,
            code: 'TIME_SESSION_STATUS_INVALID',
        });
    });
});

describe('completeTimeSession', () => {
    it('deletes a standalone session instead of marking it completed', async () => {
        setUpWorld({ sessions: [buildSessionRow('session-1')] });
        const { completeTimeSession } = await timeSessionActions();

        const completeResult = await completeTimeSession('session-1');

        expect(completeResult).toEqual({ data: null, error: null });
        expect(tables.time_sessions).toHaveLength(0);
    });

    it('updates and keeps a habit-linked session', async () => {
        setUpWorld({
            sessions: [
                buildSessionRow('session-1', {
                    habit_id: 'habit-1',
                    last_resumed_at: '2026-10-18T11:59:30.000Z',
                    accumulated_seconds: 100,
                }),
            ],
        });
        const { completeTimeSession } = await timeSessionActions();

        const completeResult = await completeTimeSession('session-1');

        expect(completeResult.data).toMatchObject({
            status: 'completed',
            accumulated_seconds: 130,
            last_resumed_at: null,
        });
        expect(tables.time_sessions).toHaveLength(1);
    });

    it('refuses completing a session that is already completed', async () => {
        setUpWorld({ sessions: [buildSessionRow('session-1', { status: 'completed' })] });
        const { completeTimeSession } = await timeSessionActions();

        expect(await completeTimeSession('session-1')).toMatchObject({
            data: null,
            code: 'TIME_SESSION_ALREADY_COMPLETED',
        });
    });
});

describe('discardTimeSession', () => {
    it('deletes a running habit-linked session outright', async () => {
        setUpWorld({ sessions: [buildSessionRow('session-1', { habit_id: 'habit-1' })] });
        const { discardTimeSession } = await timeSessionActions();

        const discardResult = await discardTimeSession('session-1');

        expect(discardResult).toEqual({ error: null });
        expect(tables.time_sessions).toHaveLength(0);
    });

    it('refuses discarding a session that is already completed', async () => {
        setUpWorld({ sessions: [buildSessionRow('session-1', { status: 'completed' })] });
        const { discardTimeSession } = await timeSessionActions();

        expect(await discardTimeSession('session-1')).toMatchObject({
            code: 'TIME_SESSION_ALREADY_COMPLETED',
        });
        expect(tables.time_sessions).toHaveLength(1);
    });
});
