import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: async () => null }));

import {
    actionResponse,
    apiErrorResponse,
    queryFailedResponse,
    withApiErrorHandling,
} from './api-response';
import { INTERNAL_ERROR, NOT_AUTHENTICATED } from '@/lib/error-codes';

describe('api-response helpers', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('apiErrorResponse carries the message, the stable code and the status', async () => {
        const response = apiErrorResponse('Nope', 'SOME_CODE', 400);

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'Nope', code: 'SOME_CODE' });
    });

    it('queryFailedResponse logs the database detail but never returns it', async () => {
        const response = queryFailedResponse(
            '[api/tasks]',
            { code: '42501', message: 'permission denied for table tasks' },
            'Failed to fetch tasks',
            'TASKS_LOAD_FAILED',
        );

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({
            error: 'Failed to fetch tasks',
            code: 'TASKS_LOAD_FAILED',
        });
        expect(console.error).toHaveBeenCalledWith('[api/tasks] query failed', {
            code: '42501',
            detail: 'permission denied for table tasks',
        });
    });

    it('withApiErrorHandling passes a normal response through untouched', async () => {
        const okResponse = apiErrorResponse('fine', 'X', 200);
        const wrapped = withApiErrorHandling(async () => okResponse);

        expect(await wrapped({})).toBe(okResponse);
        expect(console.error).not.toHaveBeenCalled();
    });

    it('withApiErrorHandling logs the route and error, and returns a generic coded 500', async () => {
        const wrapped = withApiErrorHandling(async () => {
            throw new Error('relation "tasks" does not exist');
        });

        const response = await wrapped({ method: 'GET', nextUrl: { pathname: '/api/tasks' } });

        expect(response.status).toBe(500);
        const responseBody = await response.json();
        expect(responseBody).toEqual({ error: 'Internal server error', code: INTERNAL_ERROR });
        expect(JSON.stringify(responseBody)).not.toContain('relation');
        expect(console.error).toHaveBeenCalledWith('[api] unhandled error', {
            method: 'GET',
            path: '/api/tasks',
            detail: 'relation "tasks" does not exist',
        });
    });

    it('actionResponse maps NOT_AUTHENTICATED to 401 and other failures to 400', async () => {
        const unauthenticated = actionResponse({ error: 'no', code: NOT_AUTHENTICATED });
        const rejected = actionResponse({ error: 'bad', code: 'SOMETHING_ELSE' });

        expect(unauthenticated.status).toBe(401);
        expect(rejected.status).toBe(400);
    });
});
