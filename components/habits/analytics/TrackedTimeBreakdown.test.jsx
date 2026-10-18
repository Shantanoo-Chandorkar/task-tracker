import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import TrackedTimeBreakdown from './TrackedTimeBreakdown';

describe('TrackedTimeBreakdown', () => {
    it('renders a category legend and a per-habit list', () => {
        const trackedTime = {
            byHabitId: { h1: 1500, h2: 700 },
            byCategoryId: { c1: 2200 },
        };
        const categories = [{ id: 'c1', name: 'Health', color: '#111111' }];
        const habitTitleById = new Map([
            ['h1', 'Meditate'],
            ['h2', 'Gym'],
        ]);

        render(
            <TrackedTimeBreakdown
                trackedTime={trackedTime}
                categories={categories}
                habitTitleById={habitTitleById}
            />,
        );

        expect(screen.getByText('Health')).toBeTruthy();
        expect(screen.getByText('36:40')).toBeTruthy();
        expect(screen.getByText('Meditate')).toBeTruthy();
        expect(screen.getByText('25:00')).toBeTruthy();
        expect(screen.getByText('Gym')).toBeTruthy();
        expect(screen.getByText('11:40')).toBeTruthy();
    });

    it('shows an empty state when no duration habit has any tracked time', () => {
        const trackedTime = { byHabitId: {}, byCategoryId: {} };

        render(
            <TrackedTimeBreakdown
                trackedTime={trackedTime}
                categories={[]}
                habitTitleById={new Map()}
            />,
        );

        expect(screen.getByText('No duration habits tracked yet')).toBeTruthy();
    });
});
