import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import TrackedTimeBreakdown from './TrackedTimeBreakdown';

describe('TrackedTimeBreakdown', () => {
    it('renders a habit-grouped donut and a matching per-habit list', () => {
        const trackedTime = { byHabitId: { h1: 1500, h2: 700 } };
        const habitTitleById = new Map([
            ['h1', 'Meditate'],
            ['h2', 'Gym'],
        ]);
        const habitColorById = new Map([
            ['h1', '#60a5fa'],
            ['h2', '#34d399'],
        ]);

        render(
            <TrackedTimeBreakdown
                trackedTime={trackedTime}
                habitTitleById={habitTitleById}
                habitColorById={habitColorById}
            />,
        );

        expect(screen.getByRole('img', { name: 'Tracked time by habit' })).toBeTruthy();
        expect(screen.getByText('Meditate')).toBeTruthy();
        expect(screen.getByText('25:00')).toBeTruthy();
        expect(screen.getByText('Gym')).toBeTruthy();
        expect(screen.getByText('11:40')).toBeTruthy();
    });

    it('shows an empty state when no duration habit has any tracked time', () => {
        const trackedTime = { byHabitId: {} };

        render(
            <TrackedTimeBreakdown
                trackedTime={trackedTime}
                habitTitleById={new Map()}
                habitColorById={new Map()}
            />,
        );

        expect(screen.getByText('No duration habits tracked yet')).toBeTruthy();
    });

    it('excludes a duration habit with zero tracked seconds from the list', () => {
        const trackedTime = { byHabitId: { h1: 1500, h2: 0 } };
        const habitTitleById = new Map([
            ['h1', 'Meditate'],
            ['h2', 'Gym'],
        ]);
        const habitColorById = new Map([
            ['h1', '#60a5fa'],
            ['h2', '#34d399'],
        ]);

        render(
            <TrackedTimeBreakdown
                trackedTime={trackedTime}
                habitTitleById={habitTitleById}
                habitColorById={habitColorById}
            />,
        );

        expect(screen.getByText('Meditate')).toBeTruthy();
        expect(screen.queryByText('Gym')).toBeNull();
    });
});
