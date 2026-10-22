import { describe, expect, it } from 'vitest';
import {
    computeStreaks,
    isHabitDaySuccessful,
    computeHabitDayProgress,
    computeCompletionCounts,
    resolveEffectiveStartedOn,
} from './streaks';

function entry(localDate, value = 1) {
    return { local_date: localDate, value };
}

function buildHabit(overrides) {
    return {
        polarity: 'build',
        measure_kind: 'binary',
        target_value: null,
        recurrence: { kind: 'daily' },
        started_on: '2026-10-01',
        ...overrides,
    };
}

describe('resolveEffectiveStartedOn', () => {
    it('returns started_on unchanged when no entry predates it', () => {
        const habit = buildHabit({ started_on: '2026-10-10' });
        const entries = [entry('2026-10-10'), entry('2026-10-11')];

        expect(resolveEffectiveStartedOn(habit, entries)).toBe('2026-10-10');
    });

    it('returns the earliest entry date when a backfilled entry predates started_on', () => {
        const habit = buildHabit({ started_on: '2026-10-10' });
        const entries = [entry('2026-10-10'), entry('2026-10-01'), entry('2026-10-05')];

        expect(resolveEffectiveStartedOn(habit, entries)).toBe('2026-10-01');
    });

    it('returns started_on unchanged when there are no entries at all', () => {
        const habit = buildHabit({ started_on: '2026-10-10' });

        expect(resolveEffectiveStartedOn(habit, [])).toBe('2026-10-10');
    });
});

describe('computeStreaks - daily recurrence', () => {
    it('is due and counted for a backfilled entry dated before started_on', () => {
        const habit = buildHabit({ started_on: '2026-10-10' });
        const entries = [entry('2026-10-08'), entry('2026-10-09'), entry('2026-10-10')];

        expect(computeStreaks(habit, entries, '2026-10-10')).toEqual({
            currentStreak: 3,
            longestStreak: 3,
        });
    });

    it('has a gap that resets the streak, while the longest streak keeps the earlier run', () => {
        const habit = buildHabit();
        const entries = [
            entry('2026-10-01'),
            entry('2026-10-02'),
            entry('2026-10-03'),
            entry('2026-10-05'),
        ];

        expect(computeStreaks(habit, entries, '2026-10-05')).toEqual({
            currentStreak: 1,
            longestStreak: 3,
        });
    });

    it('gives today grace: an undone today neither breaks nor extends an existing streak', () => {
        const habit = buildHabit();
        const entries = [entry('2026-10-01'), entry('2026-10-02')];

        expect(computeStreaks(habit, entries, '2026-10-03')).toEqual({
            currentStreak: 2,
            longestStreak: 2,
        });
    });

    it('is zero when nothing has ever been logged', () => {
        const habit = buildHabit();

        expect(computeStreaks(habit, [], '2026-10-03')).toEqual({
            currentStreak: 0,
            longestStreak: 0,
        });
    });

    it('a quit habit streaks on absence - a missing entry is the success', () => {
        const habit = buildHabit({ polarity: 'quit' });

        expect(computeStreaks(habit, [], '2026-10-05')).toEqual({
            currentStreak: 5,
            longestStreak: 5,
        });
    });

    it('a quit habit slip today breaks the streak immediately - no grace on that side', () => {
        const habit = buildHabit({ polarity: 'quit' });
        const entries = [entry('2026-10-05')];

        expect(computeStreaks(habit, entries, '2026-10-05')).toEqual({
            currentStreak: 0,
            longestStreak: 4,
        });
    });

    it('a quit habit slip on a past day breaks the streak at that day, not today', () => {
        const habit = buildHabit({ polarity: 'quit' });
        const entries = [entry('2026-10-03')];

        expect(computeStreaks(habit, entries, '2026-10-05')).toEqual({
            currentStreak: 2,
            longestStreak: 2,
        });
    });
});

describe('computeStreaks - weekdays recurrence', () => {
    it("only counts the rule's weekdays, skipping the rest entirely", () => {
        const habit = buildHabit({
            recurrence: { kind: 'weekdays', days: [1, 3, 5] },
            started_on: '2026-10-12',
        });
        // 2026-10-12 Mon, 10-14 Wed, 10-16 Fri are the only due days in this range.
        const entries = [entry('2026-10-12'), entry('2026-10-14'), entry('2026-10-16')];

        expect(computeStreaks(habit, entries, '2026-10-16')).toEqual({
            currentStreak: 3,
            longestStreak: 3,
        });
    });
});

describe('computeStreaks - every_n_days recurrence', () => {
    it('walks only the anchor-aligned due dates, with grace for an unfinished today', () => {
        const habit = buildHabit({
            recurrence: { kind: 'every_n_days', n: 3, anchor: '2026-10-01' },
            started_on: '2026-10-01',
        });
        // Due: 10-01, 10-04, 10-07, 10-10. Today (10-10) has no entry yet.
        const entries = [entry('2026-10-01'), entry('2026-10-04'), entry('2026-10-07')];

        expect(computeStreaks(habit, entries, '2026-10-10')).toEqual({
            currentStreak: 3,
            longestStreak: 3,
        });
    });
});

describe('computeStreaks - times_per_week recurrence', () => {
    function weeklyHabit(overrides) {
        return buildHabit({
            recurrence: { kind: 'times_per_week', count: 3 },
            started_on: '2026-09-28',
            ...overrides,
        });
    }

    it('is partially met for the current week: pending, not yet a pass or a break', () => {
        const habit = weeklyHabit();
        const entries = [
            // Week of 09-28: 3 check-ins - meets the target, a finished week.
            entry('2026-09-28'),
            entry('2026-09-29'),
            entry('2026-09-30'),
            // Week of 10-05: only 1 check-in - misses the target, a finished week.
            entry('2026-10-06'),
            // Week of 10-12 (current week, today is Friday 10-16): 2 of 3 so far.
            entry('2026-10-13'),
            entry('2026-10-14'),
        ];

        expect(computeStreaks(habit, entries, '2026-10-16')).toEqual({
            currentStreak: 0,
            longestStreak: 1,
        });
    });

    it('counts the current week immediately once its target is reached, without waiting for it to end', () => {
        const habit = weeklyHabit();
        // 3 check-ins already logged this week (Mon-Wed), with the week not yet over.
        const entries = [entry('2026-10-12'), entry('2026-10-13'), entry('2026-10-14')];

        expect(computeStreaks(habit, entries, '2026-10-14')).toEqual({
            currentStreak: 1,
            longestStreak: 1,
        });
    });

    it('a quit habit reads a week under the cap as success as soon as it is true, like a daily check', () => {
        const habit = weeklyHabit({ polarity: 'quit' });
        // Every week so far, including the in-progress one, has stayed under the cap of 3 slips.
        const entries = [entry('2026-09-29')];

        expect(computeStreaks(habit, entries, '2026-10-16')).toEqual({
            currentStreak: 3,
            longestStreak: 3,
        });
    });
});

describe('isHabitDaySuccessful', () => {
    it('is true for a build habit with a logged entry', () => {
        const habit = buildHabit();
        const entriesByDate = new Map([['2026-10-05', entry('2026-10-05')]]);

        expect(isHabitDaySuccessful(habit, entriesByDate, '2026-10-05')).toBe(true);
    });

    it('is false for a build habit with no logged entry', () => {
        const habit = buildHabit();

        expect(isHabitDaySuccessful(habit, new Map(), '2026-10-05')).toBe(false);
    });

    it('is true for a quit habit with no logged entry - absence is the success', () => {
        const habit = buildHabit({ polarity: 'quit' });

        expect(isHabitDaySuccessful(habit, new Map(), '2026-10-05')).toBe(true);
    });

    it('is false for a quit habit with a logged entry - a slip', () => {
        const habit = buildHabit({ polarity: 'quit' });
        const entriesByDate = new Map([['2026-10-05', entry('2026-10-05')]]);

        expect(isHabitDaySuccessful(habit, entriesByDate, '2026-10-05')).toBe(false);
    });
});

describe('computeHabitDayProgress', () => {
    it('is 1 for a binary build habit with a logged entry, 0 with none', () => {
        const habit = buildHabit();
        const entriesByDate = new Map([['2026-10-05', entry('2026-10-05')]]);

        expect(computeHabitDayProgress(habit, entriesByDate, '2026-10-05')).toBe(1);
        expect(computeHabitDayProgress(habit, new Map(), '2026-10-05')).toBe(0);
    });

    it('is 1 for a quit habit with no entry (held), 0 with one (slipped)', () => {
        const habit = buildHabit({ polarity: 'quit' });
        const entriesByDate = new Map([['2026-10-05', entry('2026-10-05')]]);

        expect(computeHabitDayProgress(habit, new Map(), '2026-10-05')).toBe(1);
        expect(computeHabitDayProgress(habit, entriesByDate, '2026-10-05')).toBe(0);
    });

    it('is the logged fraction of the target for a duration habit', () => {
        const habit = buildHabit({ measure_kind: 'duration', target_value: 1200 });
        const entriesByDate = new Map([['2026-10-05', entry('2026-10-05', 720)]]);

        expect(computeHabitDayProgress(habit, entriesByDate, '2026-10-05')).toBeCloseTo(0.6);
    });

    it('is the logged fraction of the target for a count habit', () => {
        const habit = buildHabit({ measure_kind: 'count', target_value: 20 });
        const entriesByDate = new Map([['2026-10-05', entry('2026-10-05', 5)]]);

        expect(computeHabitDayProgress(habit, entriesByDate, '2026-10-05')).toBeCloseTo(0.25);
    });

    it('is the logged fraction of the target for a quantity habit', () => {
        const habit = buildHabit({ measure_kind: 'quantity', target_value: 2000 });
        const entriesByDate = new Map([['2026-10-05', entry('2026-10-05', 500)]]);

        expect(computeHabitDayProgress(habit, entriesByDate, '2026-10-05')).toBeCloseTo(0.25);
    });

    it('clamps a quantified habit at 1 when the logged value exceeds the target', () => {
        const habit = buildHabit({ measure_kind: 'duration', target_value: 1200 });
        const entriesByDate = new Map([['2026-10-05', entry('2026-10-05', 1500)]]);

        expect(computeHabitDayProgress(habit, entriesByDate, '2026-10-05')).toBe(1);
    });

    it('is 0 for a quantified habit with no logged entry', () => {
        const habit = buildHabit({ measure_kind: 'duration', target_value: 1200 });

        expect(computeHabitDayProgress(habit, new Map(), '2026-10-05')).toBe(0);
    });
});

describe('computeCompletionCounts - daily recurrence', () => {
    it('counts due and completed days inside the period', () => {
        const habit = buildHabit();
        const entries = [entry('2026-10-01'), entry('2026-10-02'), entry('2026-10-05')];

        expect(
            computeCompletionCounts(habit, entries, { start: '2026-10-01', end: '2026-10-05' }),
        ).toEqual({ dueCount: 5, completedCount: 3 });
    });

    it('clamps the period start to started_on', () => {
        const habit = buildHabit({ started_on: '2026-10-03' });
        const entries = [entry('2026-10-03'), entry('2026-10-04')];

        expect(
            computeCompletionCounts(habit, entries, { start: '2026-10-01', end: '2026-10-05' }),
        ).toEqual({ dueCount: 3, completedCount: 2 });
    });

    it('is zero/zero when the period ends before the habit started', () => {
        const habit = buildHabit({ started_on: '2026-10-10' });

        expect(
            computeCompletionCounts(habit, [], { start: '2026-10-01', end: '2026-10-05' }),
        ).toEqual({ dueCount: 0, completedCount: 0 });
    });

    it('extends the due window to a backfilled entry dated before started_on', () => {
        const habit = buildHabit({ started_on: '2026-10-10' });
        const entries = [entry('2026-10-08'), entry('2026-10-10')];

        expect(
            computeCompletionCounts(habit, entries, { start: '2026-10-01', end: '2026-10-10' }),
        ).toEqual({ dueCount: 3, completedCount: 2 });
    });

    it('is polarity-aware: a quit habit with no entries is fully completed', () => {
        const habit = buildHabit({ polarity: 'quit' });

        expect(
            computeCompletionCounts(habit, [], { start: '2026-10-01', end: '2026-10-05' }),
        ).toEqual({ dueCount: 5, completedCount: 5 });
    });
});

describe('computeCompletionCounts - times_per_week recurrence', () => {
    function weeklyHabit(overrides) {
        return buildHabit({
            recurrence: { kind: 'times_per_week', count: 3 },
            started_on: '2026-09-28',
            ...overrides,
        });
    }

    it('counts due and completed weeks, not days', () => {
        const habit = weeklyHabit();
        const entries = [
            // Week of 09-28: meets the target of 3.
            entry('2026-09-28'),
            entry('2026-09-29'),
            entry('2026-09-30'),
            // Week of 10-05: misses the target (only 1).
            entry('2026-10-06'),
        ];

        expect(
            computeCompletionCounts(habit, entries, { start: '2026-09-28', end: '2026-10-11' }),
        ).toEqual({ dueCount: 2, completedCount: 1 });
    });
});
