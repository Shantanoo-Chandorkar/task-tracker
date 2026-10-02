import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PriorityLine, PriorityTierDivider } from './TaskRow';

afterEach(cleanup);

describe('PriorityLine', () => {
    it('tells screen readers the task is prioritised, not only the colour', () => {
        render(<PriorityLine />);

        expect(screen.getByText('Prioritised').className).toContain('sr-only');
    });

    it('shows only below the desktop breakpoint, where the star button is hidden', () => {
        const { container } = render(<PriorityLine />);

        expect(container.firstChild.className).toContain('lg:hidden');
    });

    it('uses the star colour, a thin width and a short height', () => {
        const { container } = render(<PriorityLine />);

        expect(container.firstChild.className).toContain('bg-amber-400');
        expect(container.firstChild.className).toContain('w-[3px]');
        expect(container.firstChild.className).toContain('h-4');
    });

    it('does not take part in layout, so a prioritised row lines up with the others', () => {
        const { container } = render(<PriorityLine />);

        expect(container.firstChild.className).toContain('absolute');
        expect(container.firstChild.className).toContain('pointer-events-none');
    });
});

describe('PriorityTierDivider', () => {
    it('has a name that says which tasks are on each side', () => {
        render(<PriorityTierDivider />);

        expect(screen.getByRole('separator').getAttribute('aria-label')).toBe(
            'Prioritised tasks above, other tasks below',
        );
    });
});
