import { describe, expect, it } from 'vitest';
import { computeConsistencyHeatmap } from './consistency-heatmap';

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

describe('computeConsistencyHeatmap', () => {
    it('builds one row per day, aggregating across habits', () => {
        const habits = [buildHabit({ id: 'h1' }), buildHabit({ id: 'h2' })];
        const entries = [entry('h1', '2026-10-01'), entry('h2', '2026-10-01')];
        const period = { start: '2026-10-01', end: '2026-10-02' };

        expect(computeConsistencyHeatmap(habits, entries, period)).toEqual([
            { localDate: '2026-10-01', dueCount: 2, successCount: 2, completionRate: 1 },
            { localDate: '2026-10-02', dueCount: 2, successCount: 0, completionRate: 0 },
        ]);
    });

    it('skips a habit on days before it started', () => {
        const habits = [buildHabit({ started_on: '2026-10-02' })];
        const period = { start: '2026-10-01', end: '2026-10-02' };

        expect(computeConsistencyHeatmap(habits, [], period)).toEqual([
            { localDate: '2026-10-01', dueCount: 0, successCount: 0, completionRate: null },
            { localDate: '2026-10-02', dueCount: 1, successCount: 0, completionRate: 0 },
        ]);
    });

    it('excludes times_per_week habits - they have no single due day', () => {
        const habits = [buildHabit({ recurrence: { kind: 'times_per_week', count: 3 } })];
        const period = { start: '2026-10-01', end: '2026-10-01' };

        expect(computeConsistencyHeatmap(habits, [], period)).toEqual([
            { localDate: '2026-10-01', dueCount: 0, successCount: 0, completionRate: null },
        ]);
    });

    it('is polarity-aware: a quit habit with no entry counts as a success', () => {
        const habits = [buildHabit({ polarity: 'quit' })];
        const period = { start: '2026-10-01', end: '2026-10-01' };

        expect(computeConsistencyHeatmap(habits, [], period)).toEqual([
            { localDate: '2026-10-01', dueCount: 1, successCount: 1, completionRate: 1 },
        ]);
    });

    it('returns an empty-but-present row set for no habits', () => {
        expect(
            computeConsistencyHeatmap([], [], { start: '2026-10-01', end: '2026-10-01' }),
        ).toEqual([
            { localDate: '2026-10-01', dueCount: 0, successCount: 0, completionRate: null },
        ]);
    });
});
