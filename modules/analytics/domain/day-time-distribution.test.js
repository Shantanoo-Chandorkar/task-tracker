import { describe, expect, it } from 'vitest';
import { computeDayTimeDistribution } from './day-time-distribution';

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

function session(overrides) {
    return {
        habit_id: 'h1',
        task_id: null,
        status: 'completed',
        accumulated_seconds: 1500,
        ...overrides,
    };
}

describe('computeDayTimeDistribution - byWeekday', () => {
    it('counts a successful check-in under its own weekday', () => {
        const habits = [buildHabit()];
        // 2026-10-01 is a Thursday (weekday 4).
        const entries = [entry('h1', '2026-10-01')];
        const period = { start: '2026-10-01', end: '2026-10-01' };

        const { byWeekday } = computeDayTimeDistribution(habits, entries, [], period, 'UTC');

        expect(byWeekday[4]).toEqual({ weekday: 4, successCount: 1 });
        expect(
            byWeekday.filter((day) => day.weekday !== 4).every((day) => day.successCount === 0),
        ).toBe(true);
    });

    it('does not count an unsuccessful day', () => {
        const habits = [buildHabit()];
        const period = { start: '2026-10-01', end: '2026-10-01' };

        const { byWeekday } = computeDayTimeDistribution(habits, [], [], period, 'UTC');

        expect(byWeekday.every((day) => day.successCount === 0)).toBe(true);
    });
});

describe('computeDayTimeDistribution - byHourOfDay', () => {
    it('buckets a session by its local start hour and sums its seconds', () => {
        const sessions = [
            session({ started_at: '2026-10-01T14:00:00Z', accumulated_seconds: 1500 }),
            session({ started_at: '2026-10-01T14:30:00Z', accumulated_seconds: 300 }),
        ];
        const period = { start: '2026-10-01', end: '2026-10-01' };

        const { byHourOfDay } = computeDayTimeDistribution([], [], sessions, period, 'UTC');

        expect(byHourOfDay[14]).toEqual({ hour: 14, sessionCount: 2, totalSeconds: 1800 });
    });

    it('resolves the local hour against the given timezone, not UTC', () => {
        // 23:30 UTC on 09-30 is 05:00 local the next day in a timezone UTC+5:30 (Asia/Kolkata).
        const sessions = [session({ started_at: '2026-09-30T23:30:00Z' })];
        const period = { start: '2026-09-30', end: '2026-10-01' };

        const { byHourOfDay } = computeDayTimeDistribution(
            [],
            [],
            sessions,
            period,
            'Asia/Kolkata',
        );

        expect(byHourOfDay[5].sessionCount).toBe(1);
        expect(byHourOfDay[23].sessionCount).toBe(0);
    });

    it('ignores a session outside the period', () => {
        const sessions = [session({ started_at: '2026-11-01T10:00:00Z' })];
        const period = { start: '2026-10-01', end: '2026-10-01' };

        const { byHourOfDay } = computeDayTimeDistribution([], [], sessions, period, 'UTC');

        expect(byHourOfDay.every((hour) => hour.sessionCount === 0)).toBe(true);
    });

    it('ignores a task-linked session - only habit-linked sessions are Habit Zone data', () => {
        const sessions = [
            session({ habit_id: null, task_id: 't1', started_at: '2026-10-01T10:00:00Z' }),
        ];
        const period = { start: '2026-10-01', end: '2026-10-01' };

        const { byHourOfDay } = computeDayTimeDistribution([], [], sessions, period, 'UTC');

        expect(byHourOfDay.every((hour) => hour.sessionCount === 0)).toBe(true);
    });
});
