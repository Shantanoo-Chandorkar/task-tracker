import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import StreakSummaryList from './StreakSummaryList';

describe('StreakSummaryList', () => {
    it('renders one row per habit with its current and longest streak', () => {
        const streakSummary = [
            { habitId: 'h1', currentStreak: 3, longestStreak: 10 },
            { habitId: 'h2', currentStreak: 0, longestStreak: 2 },
        ];
        const habitTitleById = new Map([
            ['h1', 'Meditate'],
            ['h2', 'Gym'],
        ]);

        render(<StreakSummaryList streakSummary={streakSummary} habitTitleById={habitTitleById} />);

        expect(screen.getByText('Meditate')).toBeTruthy();
        expect(screen.getByText('3 current / 10 longest')).toBeTruthy();
        expect(screen.getByText('Gym')).toBeTruthy();
        expect(screen.getByText('0 current / 2 longest')).toBeTruthy();
    });

    it('renders nothing when there are no habits', () => {
        const { container } = render(
            <StreakSummaryList streakSummary={[]} habitTitleById={new Map()} />,
        );

        expect(container.firstChild).toBeNull();
    });
});
