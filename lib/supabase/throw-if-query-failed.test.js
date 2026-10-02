import { afterEach, describe, expect, it, vi } from 'vitest';
import { throwIfQueryFailed } from './throw-if-query-failed';
import { SERVER_LOAD_FAILED } from '@/lib/error-codes';

describe('throwIfQueryFailed', () => {
    afterEach(() => vi.restoreAllMocks());

    it('does nothing when every query succeeded', () => {
        expect(() =>
            throwIfQueryFailed('[test]', { data: [], error: null }, { data: null, error: null }),
        ).not.toThrow();
    });

    it('throws a generic error that never carries the database text', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const databaseError = { code: '42P01', message: 'relation "public.tasks" does not exist' };

        expect(() => throwIfQueryFailed('[test]', { data: null, error: databaseError })).toThrow(
            SERVER_LOAD_FAILED,
        );
        try {
            throwIfQueryFailed('[test]', { data: null, error: databaseError });
        } catch (thrownError) {
            expect(thrownError.message).not.toContain('public.tasks');
        }
    });

    it('logs each failed query with its code and detail', () => {
        const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const firstError = { code: 'A', message: 'first' };
        const secondError = { code: 'B', message: 'second' };

        expect(() =>
            throwIfQueryFailed(
                '[test]',
                { data: null, error: firstError },
                { data: [], error: null },
                { data: null, error: secondError },
            ),
        ).toThrow();
        expect(logSpy).toHaveBeenCalledTimes(2);
        expect(logSpy).toHaveBeenCalledWith('[test] query failed', { code: 'A', detail: 'first' });
    });
});
