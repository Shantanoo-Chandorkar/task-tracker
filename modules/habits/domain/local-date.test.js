import { describe, expect, it } from 'vitest';
import {
    isValidLocalDateString,
    resolveLocalDate,
    isValidTimeZone,
    addDaysToLocalDate,
    localDateDiffInDays,
    startOfLocalWeek,
    isLocalDateBefore,
    isLocalDateAfter,
} from './local-date';

describe('isValidLocalDateString', () => {
    it('accepts a real calendar date', () => {
        expect(isValidLocalDateString('2026-10-18')).toBe(true);
    });

    it('accepts Feb 29 only in a leap year', () => {
        expect(isValidLocalDateString('2028-02-29')).toBe(true);
        expect(isValidLocalDateString('2026-02-29')).toBe(false);
    });

    it.each([
        [undefined],
        [null],
        [42],
        ['2026-13-01'],
        ['2026-02-30'],
        ['not-a-date'],
        ['2026/10/18'],
    ])('rejects %j', (value) => {
        expect(isValidLocalDateString(value)).toBe(false);
    });
});

describe('resolveLocalDate', () => {
    it('gives a different day in a timezone ahead of UTC, past midnight UTC', () => {
        // Decision 3's own example: 00:30 IST (UTC+5:30) is a different day than 00:30 UTC.
        expect(resolveLocalDate('2026-01-01T19:00:00.000Z', 'Asia/Kolkata')).toBe('2026-01-02');
        expect(resolveLocalDate('2026-01-01T19:00:00.000Z', 'UTC')).toBe('2026-01-01');
    });

    it('gives the previous day in a timezone behind UTC, just after UTC midnight', () => {
        expect(resolveLocalDate('2026-01-01T00:00:00.000Z', 'Etc/GMT+12')).toBe('2025-12-31');
    });

    it('crosses a DST boundary correctly (US spring-forward, 2026-03-08)', () => {
        // Same UTC clock time, two days apart: EST rolls back a day, EDT (one hour later) doesn't.
        expect(resolveLocalDate('2026-03-07T04:30:00.000Z', 'America/New_York')).toBe('2026-03-06');
        expect(resolveLocalDate('2026-03-09T04:30:00.000Z', 'America/New_York')).toBe('2026-03-09');
    });

    it('accepts a Date instance as well as an ISO string', () => {
        const instant = new Date('2026-06-15T12:00:00.000Z');
        expect(resolveLocalDate(instant, 'UTC')).toBe('2026-06-15');
    });
});

describe('isValidTimeZone', () => {
    it('accepts a real IANA timezone name', () => {
        expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
        expect(isValidTimeZone('UTC')).toBe(true);
    });

    it.each([[undefined], [null], [''], ['Nowhere/Fake'], [42]])('rejects %j', (value) => {
        expect(isValidTimeZone(value)).toBe(false);
    });
});

describe('addDaysToLocalDate', () => {
    it('adds and subtracts days across a month boundary', () => {
        expect(addDaysToLocalDate('2026-01-31', 1)).toBe('2026-02-01');
        expect(addDaysToLocalDate('2026-02-01', -1)).toBe('2026-01-31');
    });

    it('adds a day onto Feb 29 in a leap year', () => {
        expect(addDaysToLocalDate('2028-02-29', 1)).toBe('2028-03-01');
    });

    it('does nothing for zero days', () => {
        expect(addDaysToLocalDate('2026-10-18', 0)).toBe('2026-10-18');
    });
});

describe('localDateDiffInDays', () => {
    it('counts calendar days between two dates', () => {
        expect(localDateDiffInDays('2026-10-18', '2026-10-01')).toBe(17);
    });

    it('is negative when the later date comes first', () => {
        expect(localDateDiffInDays('2026-10-01', '2026-10-18')).toBe(-17);
    });

    it('is zero for the same date', () => {
        expect(localDateDiffInDays('2026-10-18', '2026-10-18')).toBe(0);
    });
});

describe('startOfLocalWeek', () => {
    it('resolves to the Monday of the containing week', () => {
        expect(startOfLocalWeek('2026-10-18')).toBe('2026-10-12');
    });

    it('is a no-op on a Monday', () => {
        expect(startOfLocalWeek('2026-10-12')).toBe('2026-10-12');
    });
});

describe('isLocalDateBefore / isLocalDateAfter', () => {
    it('compares two dates', () => {
        expect(isLocalDateBefore('2026-10-01', '2026-10-18')).toBe(true);
        expect(isLocalDateAfter('2026-10-18', '2026-10-01')).toBe(true);
    });

    it('is false for either comparison on equal dates', () => {
        expect(isLocalDateBefore('2026-10-18', '2026-10-18')).toBe(false);
        expect(isLocalDateAfter('2026-10-18', '2026-10-18')).toBe(false);
    });
});
