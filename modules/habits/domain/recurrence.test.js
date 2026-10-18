import { describe, expect, it } from 'vitest';
import { isDueOn, dueDatesBetween, RECURRENCE_KINDS } from './recurrence';

describe('RECURRENCE_KINDS', () => {
    it('lists exactly the four supported rule kinds', () => {
        expect(RECURRENCE_KINDS).toEqual(['daily', 'weekdays', 'times_per_week', 'every_n_days']);
    });
});

describe('isDueOn', () => {
    it('is due every day for a daily rule', () => {
        const rule = { kind: 'daily' };
        expect(isDueOn(rule, '2026-10-12')).toBe(true);
        expect(isDueOn(rule, '2026-10-18')).toBe(true);
    });

    it('is due every day for a times_per_week rule, since it has no single due day', () => {
        // Every day is a candidate until the week's count is met; streaks.js folds this by week.
        const rule = { kind: 'times_per_week', count: 3 };
        expect(isDueOn(rule, '2026-10-12')).toBe(true);
        expect(isDueOn(rule, '2026-10-18')).toBe(true);
    });

    describe('weekdays', () => {
        // 2026-10-12 is a Monday; 2026-10-18 is the following Sunday.
        const rule = { kind: 'weekdays', days: [1, 3, 5] };

        it.each([
            ['2026-10-12', true], // Monday
            ['2026-10-13', false], // Tuesday
            ['2026-10-14', true], // Wednesday
            ['2026-10-15', false], // Thursday
            ['2026-10-16', true], // Friday
            ['2026-10-17', false], // Saturday
            ['2026-10-18', false], // Sunday
        ])('%s is due=%s', (localDate, expected) => {
            expect(isDueOn(rule, localDate)).toBe(expected);
        });
    });

    describe('every_n_days', () => {
        const rule = { kind: 'every_n_days', n: 3, anchor: '2026-10-12' };

        it.each([
            ['2026-10-12', true], // the anchor itself
            ['2026-10-13', false],
            ['2026-10-14', false],
            ['2026-10-15', true], // 3 days after the anchor
            ['2026-10-18', true], // 6 days after the anchor
        ])('%s is due=%s', (localDate, expected) => {
            expect(isDueOn(rule, localDate)).toBe(expected);
        });

        it('is never due before its anchor', () => {
            expect(isDueOn(rule, '2026-10-09')).toBe(false);
        });

        it('stays correct across a month boundary', () => {
            const monthCrossingRule = { kind: 'every_n_days', n: 4, anchor: '2026-10-30' };
            expect(isDueOn(monthCrossingRule, '2026-10-30')).toBe(true);
            expect(isDueOn(monthCrossingRule, '2026-11-02')).toBe(false);
            expect(isDueOn(monthCrossingRule, '2026-11-03')).toBe(true);
        });
    });

    it('is never due for an unrecognised rule kind', () => {
        expect(isDueOn({ kind: 'bogus' }, '2026-10-12')).toBe(false);
    });
});

describe('dueDatesBetween', () => {
    it('lists every date for a daily rule', () => {
        const rule = { kind: 'daily' };
        expect(dueDatesBetween(rule, '2026-10-12', '2026-10-15')).toEqual([
            '2026-10-12',
            '2026-10-13',
            '2026-10-14',
            '2026-10-15',
        ]);
    });

    it('lists only the matching weekdays', () => {
        const rule = { kind: 'weekdays', days: [1, 3, 5] };
        expect(dueDatesBetween(rule, '2026-10-12', '2026-10-18')).toEqual([
            '2026-10-12',
            '2026-10-14',
            '2026-10-16',
        ]);
    });

    it('lists every date for times_per_week, leaving the weekly fold to streaks.js', () => {
        const rule = { kind: 'times_per_week', count: 3 };
        expect(dueDatesBetween(rule, '2026-10-12', '2026-10-15')).toEqual([
            '2026-10-12',
            '2026-10-13',
            '2026-10-14',
            '2026-10-15',
        ]);
    });

    it('spans a month boundary for every_n_days', () => {
        const rule = { kind: 'every_n_days', n: 4, anchor: '2026-10-30' };
        expect(dueDatesBetween(rule, '2026-10-28', '2026-11-05')).toEqual([
            '2026-10-30',
            '2026-11-03',
        ]);
    });

    it('returns an empty list for a backwards range', () => {
        const rule = { kind: 'daily' };
        expect(dueDatesBetween(rule, '2026-10-15', '2026-10-12')).toEqual([]);
    });

    it('returns a single date when start and end are the same due day', () => {
        const rule = { kind: 'daily' };
        expect(dueDatesBetween(rule, '2026-10-12', '2026-10-12')).toEqual(['2026-10-12']);
    });
});
