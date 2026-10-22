import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import HabitLaunchList from './HabitLaunchList';

describe('HabitLaunchList', () => {
    it('renders nothing for an empty habit list', () => {
        const { container } = render(<HabitLaunchList habits={[]} />);

        expect(container.firstChild).toBeNull();
    });

    it('renders one row per habit with a link to its analytics page', () => {
        const habits = [
            { id: 'h1', title: 'Meditate', color: '#60a5fa' },
            { id: 'h2', title: 'Read before bed', color: '#34d399' },
        ];

        render(<HabitLaunchList habits={habits} />);

        expect(screen.getByText('Meditate')).toBeTruthy();
        const meditateLink = screen.getAllByRole('link', { name: 'View analytics >' })[0];
        expect(meditateLink.getAttribute('href')).toBe('/habits/analytics/h1');

        expect(screen.getByText('Read before bed')).toBeTruthy();
    });
});
