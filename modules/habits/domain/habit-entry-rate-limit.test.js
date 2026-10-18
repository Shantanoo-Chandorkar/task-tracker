import { describe, expect, it } from 'vitest';
import { toHabitEntryRateLimitResult } from './habit-entry-rate-limit';

describe('toHabitEntryRateLimitResult', () => {
    it('maps the per-minute limit to a stable code and a short-wait message', () => {
        const limitResult = toHabitEntryRateLimitResult({
            message: 'HABIT_ENTRY_WRITE_RATE_LIMITED:minute',
        });
        expect(limitResult.code).toBe('HABIT_ENTRY_RATE_LIMITED');
        expect(limitResult.error).toContain('Wait a moment');
    });

    it('maps the per-hour limit to the same code with a longer-wait message', () => {
        const limitResult = toHabitEntryRateLimitResult({
            message: 'HABIT_ENTRY_WRITE_RATE_LIMITED:hour',
        });
        expect(limitResult.code).toBe('HABIT_ENTRY_RATE_LIMITED');
        expect(limitResult.error).toContain('few minutes');
    });

    it('recognises the marker inside a longer database message', () => {
        expect(
            toHabitEntryRateLimitResult({
                message: 'ERROR: HABIT_ENTRY_WRITE_RATE_LIMITED:minute CONTEXT: ...',
            }),
        ).not.toBeNull();
    });

    it('never echoes database text to the user', () => {
        const limitResult = toHabitEntryRateLimitResult({
            message: 'HABIT_ENTRY_WRITE_RATE_LIMITED:minute at public.habit_entries',
        });
        expect(JSON.stringify(limitResult)).not.toContain('public.habit_entries');
    });

    it.each([
        [null],
        [undefined],
        [{}],
        [{ message: 'permission denied for table habit_entries' }],
        [{ message: 5 }],
    ])('returns null for anything else: %j', (databaseError) => {
        expect(toHabitEntryRateLimitResult(databaseError)).toBeNull();
    });
});
