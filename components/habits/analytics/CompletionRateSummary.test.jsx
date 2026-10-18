import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import CompletionRateSummary from './CompletionRateSummary';

describe('CompletionRateSummary', () => {
    it('renders the overall percentage and per-habit breakdown', () => {
        const completionRateBreakdown = {
            byHabit: [{ habitId: 'h1', dueCount: 3, completedCount: 2, completionRate: 2 / 3 }],
            overall: { dueCount: 3, completedCount: 2, completionRate: 2 / 3 },
        };

        const { container } = render(
            <CompletionRateSummary
                completionRateBreakdown={completionRateBreakdown}
                habitTitleById={new Map([['h1', 'Meditate']])}
            />,
        );

        expect(container.querySelectorAll('.text-lg.font-semibold')[0].textContent).toBe('67%');
        expect(screen.getByText('2 of 3 due habits completed')).toBeTruthy();
        const habitRow = screen.getByText('Meditate').closest('li');
        expect(within(habitRow).getByText('67%')).toBeTruthy();
    });

    it('shows "Not enough data yet" instead of 0% when nothing has been due', () => {
        const completionRateBreakdown = {
            byHabit: [],
            overall: { dueCount: 0, completedCount: 0, completionRate: null },
        };

        render(
            <CompletionRateSummary
                completionRateBreakdown={completionRateBreakdown}
                habitTitleById={new Map()}
            />,
        );

        expect(screen.getByText(/Not enough data yet/)).toBeTruthy();
        expect(screen.queryByText('0%')).toBeNull();
    });
});
