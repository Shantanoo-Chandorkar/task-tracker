import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import DayTimeDistributionCharts from './DayTimeDistributionCharts';

function barHeight(label) {
    const barWrapper = screen.getByText(label).closest('div');
    const filledBar = barWrapper.querySelector(':scope > div > div');
    return filledBar.style.height;
}

describe('DayTimeDistributionCharts', () => {
    it('sizes the weekday with the highest success count as the tallest bar', () => {
        const byWeekday = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
            weekday,
            successCount: weekday === 2 ? 5 : 1,
        }));
        const distribution = {
            byWeekday,
            byHourOfDay: new Array(24).fill(0).map(() => ({ sessionCount: 0 })),
        };

        render(<DayTimeDistributionCharts distribution={distribution} />);

        expect(barHeight('Tue')).toBe('100%');
        expect(barHeight('Sun')).toBe('20%');
    });

    it('does not render the time-of-day chart when no habit-linked sessions exist', () => {
        const distribution = {
            byWeekday: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, successCount: 0 })),
            byHourOfDay: new Array(24).fill(0).map(() => ({ sessionCount: 0 })),
        };

        render(<DayTimeDistributionCharts distribution={distribution} />);

        expect(screen.queryByText('Focus sessions by time of day')).toBeNull();
    });

    it('groups hourly session counts into 4-hour buckets', () => {
        const byHourOfDay = new Array(24).fill(0).map((_, hour) => ({
            sessionCount: hour === 9 ? 4 : 0,
        }));
        const distribution = {
            byWeekday: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, successCount: 0 })),
            byHourOfDay,
        };

        render(<DayTimeDistributionCharts distribution={distribution} />);

        expect(barHeight('8:00')).toBe('100%');
        expect(barHeight('0:00')).toBe('0%');
    });
});
