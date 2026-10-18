import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import DateStepper from './DateStepper';

describe('DateStepper', () => {
    it('labels today and yesterday by name, anything older by date', () => {
        const { rerender } = render(
            <DateStepper
                localDate="2026-10-18"
                minLocalDate="2026-09-18"
                maxLocalDate="2026-10-18"
                onChange={vi.fn()}
            />,
        );
        expect(screen.getByText('Today')).toBeTruthy();

        rerender(
            <DateStepper
                localDate="2026-10-17"
                minLocalDate="2026-09-18"
                maxLocalDate="2026-10-18"
                onChange={vi.fn()}
            />,
        );
        expect(screen.getByText('Yesterday')).toBeTruthy();

        rerender(
            <DateStepper
                localDate="2026-10-10"
                minLocalDate="2026-09-18"
                maxLocalDate="2026-10-18"
                onChange={vi.fn()}
            />,
        );
        expect(screen.getByText('2026-10-10')).toBeTruthy();
    });

    it('disables "Next day" at the max bound and "Previous day" at the min bound', () => {
        render(
            <DateStepper
                localDate="2026-10-18"
                minLocalDate="2026-09-18"
                maxLocalDate="2026-10-18"
                onChange={vi.fn()}
            />,
        );
        expect(screen.getByLabelText('Next day').disabled).toBe(true);
        expect(screen.getByLabelText('Previous day').disabled).toBe(false);

        render(
            <DateStepper
                localDate="2026-09-18"
                minLocalDate="2026-09-18"
                maxLocalDate="2026-10-18"
                onChange={vi.fn()}
            />,
        );
        expect(screen.getAllByLabelText('Previous day').at(-1).disabled).toBe(true);
    });

    it('steps one day back or forward on click', () => {
        const onChange = vi.fn();
        render(
            <DateStepper
                localDate="2026-10-10"
                minLocalDate="2026-09-18"
                maxLocalDate="2026-10-18"
                onChange={onChange}
            />,
        );

        fireEvent.click(screen.getByLabelText('Previous day'));
        expect(onChange).toHaveBeenCalledWith('2026-10-09');

        fireEvent.click(screen.getByLabelText('Next day'));
        expect(onChange).toHaveBeenCalledWith('2026-10-11');
    });
});
