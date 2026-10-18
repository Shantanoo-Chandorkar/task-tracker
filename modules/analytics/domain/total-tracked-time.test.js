import { describe, expect, it } from 'vitest';
import { computeTotalTrackedTime } from './total-tracked-time';

function buildHabit(overrides) {
    return {
        id: 'h1',
        measure_kind: 'duration',
        category_id: null,
        ...overrides,
    };
}

function session(overrides) {
    return {
        habit_id: 'h1',
        task_id: null,
        status: 'completed',
        accumulated_seconds: 1500,
        last_resumed_at: null,
        started_at: '2026-10-01T10:00:00Z',
        ...overrides,
    };
}

const PERIOD = { start: '2026-10-01', end: '2026-10-01' };
const NOW = new Date('2026-10-01T12:00:00Z');

describe('computeTotalTrackedTime', () => {
    it('sums a completed session into its habit total', () => {
        const habits = [buildHabit()];
        const sessions = [session({ accumulated_seconds: 1500 })];

        const trackedTime = computeTotalTrackedTime(habits, sessions, PERIOD, NOW);

        expect(trackedTime.byHabitId).toEqual({ h1: 1500 });
    });

    it('sums the live elapsed time of a still-running session, not just accumulated_seconds', () => {
        const habits = [buildHabit()];
        const sessions = [
            session({
                status: 'running',
                accumulated_seconds: 100,
                last_resumed_at: '2026-10-01T11:00:00Z', // 1 hour before NOW.
            }),
        ];

        const trackedTime = computeTotalTrackedTime(habits, sessions, PERIOD, NOW);

        expect(trackedTime.byHabitId.h1).toBe(100 + 3600);
    });

    it('excludes a non-duration habit entirely', () => {
        const habits = [buildHabit({ measure_kind: 'binary' })];
        const sessions = [session()];

        const trackedTime = computeTotalTrackedTime(habits, sessions, PERIOD, NOW);

        expect(trackedTime.byHabitId).toEqual({});
    });

    it('excludes a session outside the period', () => {
        const habits = [buildHabit()];
        const sessions = [session({ started_at: '2026-11-01T10:00:00Z' })];

        const trackedTime = computeTotalTrackedTime(habits, sessions, PERIOD, NOW);

        expect(trackedTime.byHabitId).toEqual({ h1: 0 });
    });

    it('excludes a task-linked session - only habit-linked sessions are Habit Zone data', () => {
        const habits = [buildHabit()];
        const sessions = [session({ habit_id: null, task_id: 't1' })];

        const trackedTime = computeTotalTrackedTime(habits, sessions, PERIOD, NOW);

        expect(trackedTime.byHabitId).toEqual({ h1: 0 });
    });

    it('rolls habits with a shared category up into one category total', () => {
        const habits = [
            buildHabit({ id: 'h1', category_id: 'c1' }),
            buildHabit({ id: 'h2', category_id: 'c1' }),
        ];
        const sessions = [
            session({ habit_id: 'h1', accumulated_seconds: 500 }),
            session({ habit_id: 'h2', accumulated_seconds: 700 }),
        ];

        const trackedTime = computeTotalTrackedTime(habits, sessions, PERIOD, NOW);

        expect(trackedTime.byCategoryId).toEqual({ c1: 1200 });
    });

    it('does not add a habit with no category to byCategoryId', () => {
        const habits = [buildHabit({ category_id: null })];
        const sessions = [session()];

        const trackedTime = computeTotalTrackedTime(habits, sessions, PERIOD, NOW);

        expect(trackedTime.byCategoryId).toEqual({});
    });
});
