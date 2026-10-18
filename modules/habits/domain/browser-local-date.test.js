import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBrowserTodayLocalDate } from './browser-local-date';

beforeEach(() => {
    vi.useFakeTimers();
});
afterEach(() => {
    vi.useRealTimers();
});

describe('getBrowserTodayLocalDate', () => {
    it('formats the current local date as YYYY-MM-DD', () => {
        vi.setSystemTime(new Date(2026, 9, 18, 23, 59));

        expect(getBrowserTodayLocalDate()).toBe('2026-10-18');
    });

    it('zero-pads single-digit months and days', () => {
        vi.setSystemTime(new Date(2026, 0, 5));

        expect(getBrowserTodayLocalDate()).toBe('2026-01-05');
    });
});
