import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let dueTasksResult;

vi.mock('@/lib/supabase/admin', () => ({
    createClient: () => ({
        from: () => {
            const queryBuilder = {
                select: () => queryBuilder,
                eq: () => queryBuilder,
                lte: () => {
                    if (dueTasksResult instanceof Error) throw dueTasksResult;
                    return Promise.resolve(dueTasksResult);
                },
            };
            return queryBuilder;
        },
    }),
}));

function requestWithAuthorization(authorizationHeader) {
    return {
        headers: new Headers(authorizationHeader ? { authorization: authorizationHeader } : {}),
    };
}

describe('GET /api/cron/recurrence failures', () => {
    beforeEach(() => {
        vi.stubEnv('CRON_SECRET', 'test-secret');
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it('refuses a caller without the shared secret, with a stable code', async () => {
        const { GET } = await import('./route');

        const response = await GET(requestWithAuthorization('Bearer wrong'));

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: 'Unauthorized', code: 'CRON_UNAUTHORIZED' });
    });

    it('logs the database error and returns a coded 500 when the due-task read fails', async () => {
        dueTasksResult = { data: null, error: { code: '57014', message: 'timeout' } };
        const { GET } = await import('./route');

        const response = await GET(requestWithAuthorization('Bearer test-secret'));

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

        const response = await GET(requestWithAuthorization('Bearer test-secret'));

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({
            error: 'Internal server error',
            code: 'INTERNAL_ERROR',
        });
        expect(console.error).toHaveBeenCalledWith('[cron/recurrence] unhandled error', {
            detail: 'connection reset',
        });
    });
});
