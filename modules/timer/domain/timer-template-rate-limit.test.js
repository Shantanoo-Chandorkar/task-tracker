import { describe, expect, it } from 'vitest';
import { toTimerTemplateRateLimitResult } from './timer-template-rate-limit';

describe('toTimerTemplateRateLimitResult', () => {
    it('maps the per-minute limit to a stable code and a short-wait message', () => {
        const limitResult = toTimerTemplateRateLimitResult({
            message: 'TIMER_TEMPLATE_WRITE_RATE_LIMITED:minute',
        });
        expect(limitResult.code).toBe('TIMER_TEMPLATE_RATE_LIMITED');
        expect(limitResult.error).toContain('Wait a moment');
    });

    it('maps the per-hour limit to the same code with a longer-wait message', () => {
        const limitResult = toTimerTemplateRateLimitResult({
            message: 'TIMER_TEMPLATE_WRITE_RATE_LIMITED:hour',
        });
        expect(limitResult.code).toBe('TIMER_TEMPLATE_RATE_LIMITED');
        expect(limitResult.error).toContain('few minutes');
    });

    it('recognises the marker inside a longer database message', () => {
        expect(
            toTimerTemplateRateLimitResult({
                message: 'ERROR: TIMER_TEMPLATE_WRITE_RATE_LIMITED:minute CONTEXT: ...',
            }),
        ).not.toBeNull();
    });

    it('never echoes database text to the user', () => {
        const limitResult = toTimerTemplateRateLimitResult({
            message: 'TIMER_TEMPLATE_WRITE_RATE_LIMITED:minute at public.timer_templates',
        });
        expect(JSON.stringify(limitResult)).not.toContain('public.timer_templates');
    });

    it.each([
        [null],
        [undefined],
        [{}],
        [{ message: 'permission denied for table timer_templates' }],
        [{ message: 5 }],
    ])('returns null for anything else: %j', (databaseError) => {
        expect(toTimerTemplateRateLimitResult(databaseError)).toBeNull();
    });
});
