import { describe, expect, it } from 'vitest';
import { computeCompletionRate } from './completion-rate';

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

describe('computeCompletionRate', () => {
    it('returns per-habit and overall counts for a single habit', () => {
        const habits = [buildHabit()];
        const entries = [entry('h1', '2026-10-01'), entry('h1', '2026-10-02')];
        const period = { start: '2026-10-01', end: '2026-10-03' };

        const completionRateBreakdown = computeCompletionRate(habits, entries, period);

        expect(completionRateBreakdown.byHabit).toEqual([
            { habitId: 'h1', dueCount: 3, completedCount: 2, completionRate: 2 / 3 },
        ]);
        expect(completionRateBreakdown.overall).toEqual({
            dueCount: 3,
            completedCount: 2,
            completionRate: 2 / 3,
        });
    });

    it('sums counts across multiple habits for the overall figure', () => {
        const habits = [buildHabit({ id: 'h1' }), buildHabit({ id: 'h2' })];
        const entries = [entry('h1', '2026-10-01'), entry('h2', '2026-10-01')];
        const period = { start: '2026-10-01', end: '2026-10-02' };

        const completionRateBreakdown = computeCompletionRate(habits, entries, period);

        expect(completionRateBreakdown.overall).toEqual({
            dueCount: 4,
            completedCount: 2,
            completionRate: 0.5,
        });
    });

    it('reports a null completion rate, not zero, when nothing has been due yet', () => {
        const habits = [buildHabit({ started_on: '2026-10-10' })];
        const period = { start: '2026-10-01', end: '2026-10-05' };

        const completionRateBreakdown = computeCompletionRate(habits, [], period);

        expect(completionRateBreakdown.byHabit[0].completionRate).toBeNull();
        expect(completionRateBreakdown.overall.completionRate).toBeNull();
    });

    it('returns empty results for no habits', () => {
        const completionRateBreakdown = computeCompletionRate([], [], {
            start: '2026-10-01',
            end: '2026-10-05',
        });

        expect(completionRateBreakdown).toEqual({
            byHabit: [],
            overall: { dueCount: 0, completedCount: 0, completionRate: null },
        });
    });
});
