import { describe, expect, it } from 'vitest';
import { computeStreakSummary } from './streak-summary';

function buildHabit(overrides) {
    return {
        id: 'h1',
        polarity: 'build',
        measure_kind: 'binary',
        target_value: null,
        recurrence: { kind: 'daily' },
        started_on: '2026-10-01',
        ...overrides,
    };
}

function entry(habitId, localDate) {
    return { habit_id: habitId, local_date: localDate, value: 1 };
}

describe('computeStreakSummary', () => {
    it('returns the current and longest streak for a single habit', () => {
        const habits = [buildHabit()];
        const entries = [entry('h1', '2026-10-01'), entry('h1', '2026-10-02')];
        const period = { start: '2026-10-01', end: '2026-10-02' };

        expect(computeStreakSummary(habits, entries, period)).toEqual([
            { habitId: 'h1', currentStreak: 2, longestStreak: 2 },
        ]);
    });

    it("keeps each habit in its own entry, not mixing in another habit's check-ins", () => {
        const habits = [buildHabit({ id: 'h1' }), buildHabit({ id: 'h2' })];
        const entries = [entry('h1', '2026-10-01'), entry('h1', '2026-10-02')];
        const period = { start: '2026-10-01', end: '2026-10-02' };

        expect(computeStreakSummary(habits, entries, period)).toEqual([
            { habitId: 'h1', currentStreak: 2, longestStreak: 2 },
            { habitId: 'h2', currentStreak: 0, longestStreak: 0 },
        ]);
    });

    it('uses period.end as the reference "today" for the grace-period logic', () => {
        const habits = [buildHabit()];
        const entries = [entry('h1', '2026-10-01')];
        const period = { start: '2026-10-01', end: '2026-10-02' };

        // 10-02 has no entry yet, but it's period.end ("today"), so it's held back, not a break.
        expect(computeStreakSummary(habits, entries, period)).toEqual([
            { habitId: 'h1', currentStreak: 1, longestStreak: 1 },
        ]);
    });

    it('returns an empty array for no habits', () => {
        expect(computeStreakSummary([], [], { start: '2026-10-01', end: '2026-10-02' })).toEqual(
            [],
        );
    });
});
