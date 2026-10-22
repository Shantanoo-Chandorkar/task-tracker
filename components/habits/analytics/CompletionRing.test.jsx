import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import CompletionRing from './CompletionRing';

describe('CompletionRing', () => {
    it('renders the rate as a rounded percentage', () => {
        const { container } = render(<CompletionRing rate={2 / 3} />);

        expect(container.querySelector('.text-lg.font-semibold').textContent).toBe('67%');
    });

    it('renders 0% without crashing', () => {
        const { container } = render(<CompletionRing rate={0} />);

        expect(container.querySelector('.text-lg.font-semibold').textContent).toBe('0%');
    });
});
