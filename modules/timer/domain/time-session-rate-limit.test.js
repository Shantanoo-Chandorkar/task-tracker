import { describe, expect, it } from 'vitest';
import { toTimeSessionRateLimitResult } from './time-session-rate-limit';

describe('toTimeSessionRateLimitResult', () => {
    it('maps the per-minute limit to a stable code and a short-wait message', () => {
        const limitResult = toTimeSessionRateLimitResult({
            message: 'TIME_SESSION_WRITE_RATE_LIMITED:minute',
        });
        expect(limitResult.code).toBe('TIME_SESSION_RATE_LIMITED');
        expect(limitResult.error).toContain('Wait a moment');
    });

    it('maps the per-hour limit to the same code with a longer-wait message', () => {
        const limitResult = toTimeSessionRateLimitResult({
            message: 'TIME_SESSION_WRITE_RATE_LIMITED:hour',
        });
        expect(limitResult.code).toBe('TIME_SESSION_RATE_LIMITED');
        expect(limitResult.error).toContain('few minutes');
    });

    it('recognises the marker inside a longer database message', () => {
        expect(
            toTimeSessionRateLimitResult({
                message: 'ERROR: TIME_SESSION_WRITE_RATE_LIMITED:minute CONTEXT: ...',
            }),
        ).not.toBeNull();
    });

    it('never echoes database text to the user', () => {
        const limitResult = toTimeSessionRateLimitResult({
            message: 'TIME_SESSION_WRITE_RATE_LIMITED:minute at public.time_sessions',
        });
        expect(JSON.stringify(limitResult)).not.toContain('public.time_sessions');
    });

    it.each([
        [null],
        [undefined],
        [{}],
        [{ message: 'permission denied for table time_sessions' }],
        [{ message: 5 }],
    ])('returns null for anything else: %j', (databaseError) => {
        expect(toTimeSessionRateLimitResult(databaseError)).toBeNull();
    });
});
