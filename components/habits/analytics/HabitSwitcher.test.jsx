import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import HabitSwitcher from './HabitSwitcher';

// Radix Select positions its listbox with ResizeObserver and scrollIntoView, which jsdom lacks
beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
    Element.prototype.scrollIntoView = () => {};
});

const routerPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: routerPush }) }));

beforeEach(() => {
    routerPush.mockReset();
});

const HABITS = [
    { id: 'h1', title: 'Meditate', archived_at: null },
    { id: 'h2', title: 'Read before bed', archived_at: '2026-10-01T00:00:00Z' },
];

describe('HabitSwitcher', () => {
    it('shows the current habit as the selected value', () => {
        render(<HabitSwitcher habits={HABITS} currentHabitId="h1" />);

        expect(screen.getByRole('combobox', { name: 'Switch habit' }).textContent).toBe('Meditate');
    });

    it('labels an archived habit so it is not confused with an active one', () => {
        render(<HabitSwitcher habits={HABITS} currentHabitId="h1" />);

        fireEvent.click(screen.getByRole('combobox', { name: 'Switch habit' }));

        expect(screen.getByText('Read before bed (archived)')).toBeTruthy();
    });

    it('navigates to the chosen habit on change', () => {
        render(<HabitSwitcher habits={HABITS} currentHabitId="h1" />);

        fireEvent.click(screen.getByRole('combobox', { name: 'Switch habit' }));
        fireEvent.click(screen.getByText('Read before bed (archived)'));

        expect(routerPush).toHaveBeenCalledWith('/habits/analytics/h2');
    });
});
