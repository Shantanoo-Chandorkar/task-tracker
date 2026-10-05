import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A Thursday at noon, so a daily rule's next date is unambiguous
const FIXED_NOW = new Date('2026-01-01T12:00:00.000Z');

let dueTasksResult;
let rpcReplies;
const rpcCalls = [];
const dueTaskQueries = [];

vi.mock('@/lib/supabase/admin', () => ({
    createClient: () => ({
        from: () => {
            const queryBuilder = {
                select: () => queryBuilder,
                eq: () => queryBuilder,
                order: () => queryBuilder,
                limit: (rowLimit) => {
                    dueTaskQueries.push({ rowLimit });
                    return queryBuilder;
                },
                lte: () => queryBuilder,
                then: (resolve, reject) => {
                    if (dueTasksResult instanceof Error) return reject(dueTasksResult);
                    return resolve(dueTasksResult);
                },
            };
            return queryBuilder;
        },
        rpc: async (functionName, args) => {
            rpcCalls.push({ functionName, args });
            return rpcReplies.shift() ?? { data: true, error: null };
        },
    }),
}));

function requestWithAuthorization(authorizationHeader) {
    return {
        headers: new Headers(authorizationHeader ? { authorization: authorizationHeader } : {}),
    };
}

const authorizedRequest = () => requestWithAuthorization('Bearer test-secret');

describe('GET /api/cron/recurrence', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(FIXED_NOW);
        vi.stubEnv('CRON_SECRET', 'test-secret');
        vi.spyOn(console, 'error').mockImplementation(() => {});
        rpcCalls.length = 0;
        dueTaskQueries.length = 0;
        rpcReplies = [];
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it('refuses a caller without the shared secret, with a stable code', async () => {
        const { GET } = await import('./route');

        const response = await GET(requestWithAuthorization('Bearer wrong'));

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: 'Unauthorized', code: 'CRON_UNAUTHORIZED' });
        expect(rpcCalls).toHaveLength(0);
    });

    it('logs the database error and returns a coded 500 when the due-task read fails', async () => {
        dueTasksResult = { data: null, error: { code: '57014', message: 'timeout' } };
        const { GET } = await import('./route');

        const response = await GET(authorizedRequest());

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({
            error: 'Failed to fetch recurring tasks',
            code: 'RECURRENCE_LOAD_FAILED',
        });
        expect(console.error).toHaveBeenCalledWith('[cron/recurrence] query failed', {
            code: '57014',
            detail: 'timeout',
        });
    });

    it('logs an unexpected exception instead of swallowing it, and returns a coded 500', async () => {
        dueTasksResult = new Error('connection reset');
        const { GET } = await import('./route');

        const response = await GET(authorizedRequest());

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({
            error: 'Internal server error',
            code: 'INTERNAL_ERROR',
        });
        expect(console.error).toHaveBeenCalledWith('[cron/recurrence] unhandled error', {
            detail: 'connection reset',
        });
    });

    it('does nothing when no task is due', async () => {
        dueTasksResult = { data: [], error: null };
        const { GET } = await import('./route');

        const response = await GET(authorizedRequest());

        expect(await response.json()).toEqual({ processed: 0, failed: 0 });
        expect(rpcCalls).toHaveLength(0);
    });

    it('spawns each due task through the database function with its next date', async () => {
        dueTasksResult = {
            data: [
                {
                    id: 'task-daily',
                    recurrence_rule: { freq: 'DAILY' },
                    recurrence_spawned_count: 0,
                },
                {
                    id: 'task-weekly',
                    recurrence_rule: { freq: 'WEEKLY' },
                    recurrence_spawned_count: 4,
                },
            ],
            error: null,
        };
        const { GET } = await import('./route');

        const response = await GET(authorizedRequest());

        expect(await response.json()).toEqual({ processed: 2, failed: 0 });
        expect(rpcCalls).toEqual([
            {
                functionName: 'spawn_recurring_task',
                args: { p_task_id: 'task-daily', p_next_occurrence: '2026-01-02T12:00:00.000Z' },
            },
            {
                functionName: 'spawn_recurring_task',
                args: { p_task_id: 'task-weekly', p_next_occurrence: '2026-01-08T12:00:00.000Z' },
            },
        ]);
    });

    it('ends a count-limited series by passing no next date on its last copy', async () => {
        dueTasksResult = {
            data: [
                {
                    id: 'task-last-copy',
                    recurrence_rule: { freq: 'DAILY', count: 3 },
                    recurrence_spawned_count: 1,
                },
                {
                    id: 'task-middle-copy',
                    recurrence_rule: { freq: 'DAILY', count: 3 },
                    recurrence_spawned_count: 0,
                },
            ],
            error: null,
        };
        const { GET } = await import('./route');

        await GET(authorizedRequest());

        expect(rpcCalls[0].args).toEqual({ p_task_id: 'task-last-copy', p_next_occurrence: null });
        expect(rpcCalls[1].args.p_next_occurrence).toBe('2026-01-02T12:00:00.000Z');
    });

    it('keeps going after one task fails, counts it, and logs it without leaking detail', async () => {
        dueTasksResult = {
            data: [
                {
                    id: 'task-broken',
                    recurrence_rule: { freq: 'DAILY' },
                    recurrence_spawned_count: 0,
                },
                {
                    id: 'task-fine',
                    recurrence_rule: { freq: 'DAILY' },
                    recurrence_spawned_count: 0,
                },
            ],
            error: null,
        };
        rpcReplies = [{ data: null, error: { code: '23503', message: 'foreign key detail' } }];
        const { GET } = await import('./route');

        const response = await GET(authorizedRequest());
        const responseBody = await response.json();

        expect(responseBody).toEqual({ processed: 1, failed: 1 });
        expect(JSON.stringify(responseBody)).not.toContain('foreign key');
        expect(rpcCalls).toHaveLength(2);
        expect(console.error).toHaveBeenCalledWith('[cron/recurrence] spawn failed', {
            taskId: 'task-broken',
            code: '23503',
            detail: 'foreign key detail',
        });
    });

    it('does not count a task the database says is no longer due, so a replay adds nothing', async () => {
        dueTasksResult = {
            data: [{ id: 'task-already-done', recurrence_rule: { freq: 'DAILY' } }],
            error: null,
        };
        rpcReplies = [{ data: false, error: null }];
        const { GET } = await import('./route');

        const response = await GET(authorizedRequest());

        expect(await response.json()).toEqual({ processed: 0, failed: 0 });
    });

    it('reads at most one bounded batch of due tasks per run', async () => {
        dueTasksResult = { data: [], error: null };
        const { GET } = await import('./route');

        await GET(authorizedRequest());

        expect(dueTaskQueries).toEqual([{ rowLimit: 300 }]);
    });
});
