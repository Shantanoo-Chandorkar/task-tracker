import { describe, expect, it } from 'vitest';
import { listDailyHabitOutcomes } from './daily-habit-outcomes';

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

describe('listDailyHabitOutcomes', () => {
    it('lists one outcome per due day per habit', () => {
        const habits = [buildHabit()];
        const entries = [entry('h1', '2026-10-01')];
        const period = { start: '2026-10-01', end: '2026-10-02' };

        expect(listDailyHabitOutcomes(habits, entries, period)).toEqual([
            { localDate: '2026-10-01', habitId: 'h1', isSuccessful: true },
            { localDate: '2026-10-02', habitId: 'h1', isSuccessful: false },
        ]);
    });

    it('skips a habit before it started', () => {
        const habits = [buildHabit({ started_on: '2026-10-02' })];
        const period = { start: '2026-10-01', end: '2026-10-02' };

        expect(listDailyHabitOutcomes(habits, [], period)).toEqual([
            { localDate: '2026-10-02', habitId: 'h1', isSuccessful: false },
        ]);
    });

    it('skips days the recurrence rule does not mark due', () => {
        const habits = [buildHabit({ recurrence: { kind: 'weekdays', days: [1] } })];
        // 2026-10-01 is a Thursday (day 4), not Monday - not due.
        const period = { start: '2026-10-01', end: '2026-10-01' };

        expect(listDailyHabitOutcomes(habits, [], period)).toEqual([]);
    });

    it('excludes times_per_week habits entirely', () => {
        const habits = [buildHabit({ recurrence: { kind: 'times_per_week', count: 3 } })];
        const period = { start: '2026-10-01', end: '2026-10-01' };

        expect(listDailyHabitOutcomes(habits, [], period)).toEqual([]);
    });
});
