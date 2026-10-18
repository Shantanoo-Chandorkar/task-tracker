import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import DatePillStrip from './DatePillStrip';

// jsdom has no layout engine, so scrollIntoView doesn't exist - stub it like other scroll-on-select tests.
beforeAll(() => {
    Element.prototype.scrollIntoView = () => {};
});

describe('DatePillStrip', () => {
    it('renders one pill per date in the range, inclusive of both ends', () => {
        render(
            <DatePillStrip
                localDate="2026-10-18"
                minLocalDate="2026-10-16"
                maxLocalDate="2026-10-18"
                loggedLocalDates={new Set()}
                onChange={vi.fn()}
            />,
        );

        expect(screen.getAllByRole('button')).toHaveLength(3);
    });

    it('marks the selected date, and only the selected date, as pressed', () => {
        render(
            <DatePillStrip
                localDate="2026-10-17"
                minLocalDate="2026-10-16"
                maxLocalDate="2026-10-18"
                loggedLocalDates={new Set()}
                onChange={vi.fn()}
            />,
        );

        const pills = screen.getAllByRole('button');
        expect(pills.map((pill) => pill.getAttribute('aria-pressed'))).toEqual([
            'false',
            'true',
            'false',
        ]);
    });

    it('visually distinguishes a date that already has a logged entry', () => {
        render(
            <DatePillStrip
                localDate="2026-10-18"
                minLocalDate="2026-10-16"
                maxLocalDate="2026-10-18"
                loggedLocalDates={new Set(['2026-10-16'])}
                onChange={vi.fn()}
            />,
        );

        const loggedPill = screen.getByLabelText('Friday, October 16, 2026');
        expect(loggedPill.className).toContain('bg-metric');
    });

    it('shows the month on every pill, not just the bare day number', () => {
        render(
            <DatePillStrip
                localDate="2026-10-18"
                minLocalDate="2026-10-16"
                maxLocalDate="2026-10-18"
                loggedLocalDates={new Set()}
                onChange={vi.fn()}
            />,
        );

        expect(screen.getByText('Oct 16')).toBeTruthy();
        expect(screen.getByText('Oct 18')).toBeTruthy();
    });

    it('labels each pill with its own month across a month boundary', () => {
        render(
            <DatePillStrip
                localDate="2026-11-01"
                minLocalDate="2026-10-31"
                maxLocalDate="2026-11-01"
                loggedLocalDates={new Set()}
                onChange={vi.fn()}
            />,
        );

        expect(screen.getByText('Oct 31')).toBeTruthy();
        expect(screen.getByText('Nov 1')).toBeTruthy();
    });

    it('visually distinguishes a date with an unsaved draft from a logged or untouched one', () => {
        render(
            <DatePillStrip
                localDate="2026-10-18"
                minLocalDate="2026-10-16"
                maxLocalDate="2026-10-18"
                loggedLocalDates={new Set(['2026-10-16'])}
                draftLocalDates={new Set(['2026-10-17'])}
                onChange={vi.fn()}
            />,
        );

        const loggedPill = screen.getByLabelText('Friday, October 16, 2026');
        const draftPill = screen.getByLabelText('Saturday, October 17, 2026 (unsaved)');
        expect(loggedPill.className).toContain('bg-metric');
        expect(draftPill.className).not.toContain('bg-metric');
        expect(draftPill.className).toContain('border-primary');
    });

    it('calls onChange with the tapped date, without toggling or saving anything itself', () => {
        const onChange = vi.fn();
        render(
            <DatePillStrip
                localDate="2026-10-18"
                minLocalDate="2026-10-16"
                maxLocalDate="2026-10-18"
                loggedLocalDates={new Set()}
                onChange={onChange}
            />,
        );

        fireEvent.click(screen.getByLabelText('Friday, October 16, 2026'));

        expect(onChange).toHaveBeenCalledWith('2026-10-16');
        expect(onChange).toHaveBeenCalledTimes(1);
    });
});
