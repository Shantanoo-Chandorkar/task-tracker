import { describe, expect, it } from 'vitest';
import { computeStreaks } from './streaks';

function entry(localDate) {
    return { local_date: localDate, value: 1 };
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

describe('computeStreaks - daily recurrence', () => {
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
