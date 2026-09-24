import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeNextOccurrence, humanReadableLabel } from './recurrence';

// A Thursday, so weekly-on-Monday has an unambiguous next date
const FIXED_NOW = new Date('2026-01-01T12:00:00.000Z');

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
    vi.useRealTimers();
});

describe('computeNextOccurrence', () => {
    it('returns null when there is no rule', () => {
        expect(computeNextOccurrence(null)).toBeNull();
        expect(computeNextOccurrence(undefined)).toBeNull();
    });

    it('returns the next day for a daily rule', () => {
        expect(computeNextOccurrence({ freq: 'DAILY' })).toEqual(
            new Date('2026-01-02T12:00:00.000Z'),
        );
    });

    it('honours the interval', () => {
        expect(computeNextOccurrence({ freq: 'DAILY', interval: 3 })).toEqual(
            new Date('2026-01-04T12:00:00.000Z'),
        );
    });

    it('returns the next selected weekday for a weekly rule', () => {
        expect(computeNextOccurrence({ freq: 'WEEKLY', byweekday: ['MO'] })).toEqual(
            new Date('2026-01-05T12:00:00.000Z'),
        );
    });

    it('falls back to a daily rule for an unknown frequency', () => {
        expect(computeNextOccurrence({ freq: 'SOMETIMES' })).toEqual(
            new Date('2026-01-02T12:00:00.000Z'),
        );
    });

    it('ignores unknown weekday names instead of throwing', () => {
        expect(() => computeNextOccurrence({ freq: 'WEEKLY', byweekday: ['XX'] })).not.toThrow();
    });

    it('returns null once the count of occurrences is used up', () => {
        expect(computeNextOccurrence({ freq: 'DAILY', count: 1 })).toBeNull();
    });

    it('returns null when the end date is already in the past', () => {
        expect(computeNextOccurrence({ freq: 'DAILY', until: '2020-01-01' })).toBeNull();
    });

    it('returns null instead of throwing for an unparseable end date', () => {
        expect(computeNextOccurrence({ freq: 'DAILY', until: 'not-a-date' })).toBeNull();
    });

    it('does not throw when the stored rule is a bare string instead of an object', () => {
        expect(() => computeNextOccurrence('DAILY')).not.toThrow();
    });
});

describe('humanReadableLabel', () => {
    it('returns an empty string when there is no rule', () => {
        expect(humanReadableLabel(null)).toBe('');
        expect(humanReadableLabel(undefined)).toBe('');
    });

    it('describes a daily rule with an interval', () => {
        expect(humanReadableLabel({ freq: 'DAILY', interval: 2 })).toBe('every 2 days');
    });

    it('lists the selected weekdays for a weekly rule', () => {
        expect(humanReadableLabel({ freq: 'WEEKLY', byweekday: ['MO', 'WE'] })).toBe(
            'every week on Monday, Wednesday',
        );
    });

    it('never throws for a malformed rule', () => {
        expect(() => humanReadableLabel({ freq: 'DAILY', until: 'not-a-date' })).not.toThrow();
    });
});
