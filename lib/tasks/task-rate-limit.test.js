import { describe, expect, it } from 'vitest';
import { toTaskRateLimitResult } from './task-rate-limit';

describe('toTaskRateLimitResult', () => {
    it('maps the per-minute limit to a stable code and a short-wait message', () => {
        const limitResult = toTaskRateLimitResult({ message: 'TASK_WRITE_RATE_LIMITED:minute' });
        expect(limitResult.code).toBe('TASK_RATE_LIMITED');
        expect(limitResult.error).toContain('Wait a moment');
    });

    it('maps the per-hour limit to the same code with a longer-wait message', () => {
        const limitResult = toTaskRateLimitResult({ message: 'TASK_WRITE_RATE_LIMITED:hour' });
        expect(limitResult.code).toBe('TASK_RATE_LIMITED');
        expect(limitResult.error).toContain('few minutes');
    });

    it('recognises the marker inside a longer database message', () => {
        expect(
            toTaskRateLimitResult({
                message: 'ERROR: TASK_WRITE_RATE_LIMITED:minute CONTEXT: ...',
            }),
        ).not.toBeNull();
    });

    it('never echoes database text to the user', () => {
        const limitResult = toTaskRateLimitResult({
            message: 'TASK_WRITE_RATE_LIMITED:minute at public.tasks',
        });
        expect(JSON.stringify(limitResult)).not.toContain('public.tasks');
    });

    it.each([
        [null],
        [undefined],
        [{}],
        [{ message: 'permission denied for table tasks' }],
        [{ message: 5 }],
    ])('returns null for anything else: %j', (databaseError) => {
        expect(toTaskRateLimitResult(databaseError)).toBeNull();
    });
});
