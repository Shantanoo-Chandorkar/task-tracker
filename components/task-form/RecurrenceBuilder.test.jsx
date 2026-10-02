import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import RecurrenceBuilder from './RecurrenceBuilder';

afterEach(cleanup);

describe('RecurrenceBuilder accessibility', () => {
    it('groups the controls under one name', () => {
        render(<RecurrenceBuilder value={null} onChange={vi.fn()} />);

        expect(screen.getByRole('group', { name: 'Recurrence' })).toBeTruthy();
    });

    it('names the interval and frequency controls', () => {
        render(<RecurrenceBuilder value={null} onChange={vi.fn()} />);

        expect(screen.getByLabelText('Repeat every')).toBeTruthy();
        expect(screen.getByRole('combobox', { name: 'Frequency' })).toBeTruthy();
        expect(screen.getByRole('combobox', { name: 'Ends' })).toBeTruthy();
    });

    it('names the occurrence count when the rule ends after a number of times', () => {
        render(
            <RecurrenceBuilder
                value={{ freq: 'DAILY', interval: 1, count: 3 }}
                onChange={vi.fn()}
            />,
        );

        expect(screen.getByLabelText('Number of occurrences')).toBeTruthy();
    });

    it('names the end date when the rule ends on a date', () => {
        render(
            <RecurrenceBuilder
                value={{ freq: 'DAILY', interval: 1, until: '2030-01-01' }}
                onChange={vi.fn()}
            />,
        );

        expect(screen.getByLabelText('End date')).toBeTruthy();
    });
});
