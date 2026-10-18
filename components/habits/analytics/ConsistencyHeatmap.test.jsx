import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import ConsistencyHeatmap from './ConsistencyHeatmap';

function buildHabit(overrides = {}) {
    return {
        id: 'h1',
        polarity: 'build',
        measure_kind: 'binary',
        target_value: null,
        recurrence: { kind: 'daily' },
        started_on: '2025-01-01',
        ...overrides,
    };
}

describe('ConsistencyHeatmap', () => {
    it('renders a labelled grid for each of the 7/30/90/365-day windows', () => {
        render(
            <ConsistencyHeatmap
                activeHabits={[buildHabit()]}
                entries={[{ habit_id: 'h1', local_date: '2026-10-18', value: 1 }]}
                todayLocalDate="2026-10-18"
            />,
        );

        expect(screen.getByText('Last 7 days')).toBeTruthy();
        expect(screen.getByText('Last 30 days')).toBeTruthy();
        expect(screen.getByText('Last 90 days')).toBeTruthy();
        expect(screen.getByText('Last 365 days')).toBeTruthy();
    });

    it('shows one shared legend, not one per window', () => {
        render(
            <ConsistencyHeatmap
                activeHabits={[buildHabit()]}
                entries={[]}
                todayLocalDate="2026-10-18"
            />,
        );

        expect(screen.getAllByText('Nothing due')).toHaveLength(1);
        expect(screen.getAllByText('Less')).toHaveLength(1);
        expect(screen.getAllByText('More')).toHaveLength(1);
    });

    it('each window has its own cell for every day in its range', () => {
        render(
            <ConsistencyHeatmap
                activeHabits={[buildHabit()]}
                entries={[]}
                todayLocalDate="2026-10-18"
            />,
        );

        // 7 + 30 + 90 + 365 due-habit cells, one per day across the four windows.
        expect(screen.getAllByRole('img')).toHaveLength(7 + 30 + 90 + 365);
    });

    it('renders nothing when there are no active habits', () => {
        const { container } = render(
            <ConsistencyHeatmap activeHabits={[]} entries={[]} todayLocalDate="2026-10-18" />,
        );

        expect(container.firstChild).toBeNull();
    });
});
