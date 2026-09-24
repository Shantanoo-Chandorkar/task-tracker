import { describe, expect, it } from 'vitest';
import { toGuestLimitResult } from './guest-database-errors';
import { GUEST_ERROR_CODES } from './guest-error-codes';
import { GUEST_LIMITS } from './guest-config';

describe('toGuestLimitResult', () => {
    it.each(Object.keys(GUEST_LIMITS))(
        'maps a %s limit error to the limit code and its number',
        (tableName) => {
            const limitResult = toGuestLimitResult({ message: `GUEST_LIMIT_REACHED:${tableName}` });
            expect(limitResult.code).toBe(GUEST_ERROR_CODES.LIMIT_REACHED);
            expect(limitResult.error).toContain(String(GUEST_LIMITS[tableName]));
        },
    );

    it('uses the singular noun when the limit is one', () => {
        expect(toGuestLimitResult({ message: 'GUEST_LIMIT_REACHED:spaces' }).error).toContain(
            '1 space.',
        );
    });

    it('gives a general message for the text limit, which has no number', () => {
        const limitResult = toGuestLimitResult({ message: 'GUEST_LIMIT_REACHED:text' });
        expect(limitResult.code).toBe(GUEST_ERROR_CODES.LIMIT_REACHED);
        expect(limitResult.error).toMatch(/limit/i);
    });

    it('finds the marker inside a wrapped error, as duplicateTask throws it', () => {
        const wrapped = new Error('Failed to insert node: GUEST_LIMIT_REACHED:tasks');
        expect(toGuestLimitResult(wrapped).code).toBe(GUEST_ERROR_CODES.LIMIT_REACHED);
    });

    it('returns null for any other error, so the caller keeps its generic message', () => {
        expect(
            toGuestLimitResult({ message: 'duplicate key value violates unique constraint' }),
        ).toBeNull();
        expect(toGuestLimitResult({ message: 'permission denied for table tasks' })).toBeNull();
        expect(toGuestLimitResult(null)).toBeNull();
        expect(toGuestLimitResult(undefined)).toBeNull();
        expect(toGuestLimitResult({})).toBeNull();
    });

    it('never echoes the raw database message', () => {
        const limitResult = toGuestLimitResult({ message: 'GUEST_LIMIT_REACHED:tasks' });
        expect(limitResult.error).not.toContain('GUEST_LIMIT_REACHED');
    });
});
