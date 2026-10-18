import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import HabitEntryDialog from './HabitEntryDialog';

const toggle = vi.fn().mockResolvedValue(true);
const setValue = vi.fn().mockResolvedValue(true);
vi.mock('@/hooks/useHabitCheckIn', () => ({ useHabitCheckIn: () => ({ toggle }) }));
vi.mock('@/hooks/useHabitEntryValue', () => ({ useHabitEntryValue: () => ({ setValue }) }));
vi.mock('@/hooks/useIsDesktop', () => ({ useIsDesktop: () => true }));

const TODAY = '2026-10-18';

function buildHabit(overrides = {}) {
    return {
        id: 'habit-1',
        title: 'Meditate',
        polarity: 'build',
        measure_kind: 'binary',
        target_value: null,
        unit_code: null,
        ...overrides,
    };
}

beforeEach(() => {
    toggle.mockClear();
    setValue.mockClear();
});

describe('HabitEntryDialog binary body', () => {
    it('shows a toggle and calls toggle() for today, with no Save button', () => {
        const habit = buildHabit();
        render(
            <HabitEntryDialog
                open
                onClose={vi.fn()}
                habit={habit}
                entries={[]}
                todayLocalDate={TODAY}
            />,
        );

        expect(screen.queryByText('Save')).toBeNull();
        fireEvent.click(screen.getByText('Not done yet'));

        expect(toggle).toHaveBeenCalledWith(habit, null, TODAY);
    });

    it('closes the dialog after a successful toggle, same as any other modal', async () => {
        const onClose = vi.fn();
        const habit = buildHabit();
        render(
            <HabitEntryDialog
                open
                onClose={onClose}
                habit={habit}
                entries={[]}
                todayLocalDate={TODAY}
            />,
        );

        fireEvent.click(screen.getByText('Not done yet'));

        await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('does not close the dialog when the toggle fails', async () => {
        toggle.mockResolvedValueOnce(false);
        const onClose = vi.fn();
        const habit = buildHabit();
        render(
            <HabitEntryDialog
                open
                onClose={onClose}
                habit={habit}
                entries={[]}
                todayLocalDate={TODAY}
            />,
        );

        await screen.findByText('Not done yet');
        fireEvent.click(screen.getByText('Not done yet'));
        await waitFor(() => expect(toggle).toHaveBeenCalled());

        expect(onClose).not.toHaveBeenCalled();
    });

    it('inverts the label for a quit habit', () => {
        const habit = buildHabit({ polarity: 'quit' });
        const entries = [{ id: 'entry-1', habit_id: 'habit-1', local_date: TODAY, value: 1 }];
        render(
            <HabitEntryDialog
                open
                onClose={vi.fn()}
                habit={habit}
                entries={entries}
                todayLocalDate={TODAY}
            />,
        );

        expect(screen.getByText('Slipped')).toBeTruthy();
    });
});

describe('HabitEntryDialog count body', () => {
    function buildCountHabit(overrides = {}) {
        return buildHabit({ measure_kind: 'count', target_value: 20, ...overrides });
    }

    it('prefills the stepper from an existing entry and saves an edited value', async () => {
        const habit = buildCountHabit();
        const entries = [{ id: 'entry-1', habit_id: 'habit-1', local_date: TODAY, value: 5 }];
        render(
            <HabitEntryDialog
                open
                onClose={vi.fn()}
                habit={habit}
                entries={entries}
                todayLocalDate={TODAY}
            />,
        );

        expect(screen.getByLabelText('Value').value).toBe('5');
        fireEvent.click(screen.getByLabelText('Increase'));
        expect(screen.getByLabelText('Value').value).toBe('6');

        fireEvent.click(screen.getByText('Save'));
        expect(setValue).toHaveBeenCalledWith(habit, entries[0], TODAY, '6');
    });

    it('shows Clear only when a value is already logged, and clears it', () => {
        const habit = buildCountHabit();
        render(
            <HabitEntryDialog
                open
                onClose={vi.fn()}
                habit={habit}
                entries={[]}
                todayLocalDate={TODAY}
            />,
        );
        expect(screen.queryByText('Clear')).toBeNull();

        fireEvent.click(screen.getByLabelText('Increase'));
        fireEvent.click(screen.getByText('Save'));
        expect(setValue).toHaveBeenCalledWith(habit, null, TODAY, '1');
    });

    it('shows an inline error and never calls setValue when saving an emptied field', () => {
        const habit = buildCountHabit();
        const entries = [{ id: 'entry-1', habit_id: 'habit-1', local_date: TODAY, value: 5 }];
        render(
            <HabitEntryDialog
                open
                onClose={vi.fn()}
                habit={habit}
                entries={entries}
                todayLocalDate={TODAY}
            />,
        );

        fireEvent.change(screen.getByLabelText('Value'), { target: { value: '' } });
        fireEvent.click(screen.getByText('Save'));

        expect(screen.getByText('Value cannot be empty')).toBeTruthy();
        expect(setValue).not.toHaveBeenCalled();
    });

    it('closes the dialog after a successful save, same as any other modal', async () => {
        const onClose = vi.fn();
        const habit = buildCountHabit();
        render(
            <HabitEntryDialog
                open
                onClose={onClose}
                habit={habit}
                entries={[]}
                todayLocalDate={TODAY}
            />,
        );

        fireEvent.click(screen.getByLabelText('Increase'));
        fireEvent.click(screen.getByText('Save'));

        await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('does not close the dialog when the save fails', async () => {
        setValue.mockResolvedValueOnce(false);
        const onClose = vi.fn();
        const habit = buildCountHabit();
        render(
            <HabitEntryDialog
                open
                onClose={onClose}
                habit={habit}
                entries={[]}
                todayLocalDate={TODAY}
            />,
        );

        fireEvent.click(screen.getByLabelText('Increase'));
        fireEvent.click(screen.getByText('Save'));
        await waitFor(() => expect(setValue).toHaveBeenCalled());

        expect(onClose).not.toHaveBeenCalled();
    });

    it('closes the dialog after a successful clear', async () => {
        const onClose = vi.fn();
        const habit = buildCountHabit();
        const entries = [{ id: 'entry-1', habit_id: 'habit-1', local_date: TODAY, value: 5 }];
        render(
            <HabitEntryDialog
                open
                onClose={onClose}
                habit={habit}
                entries={entries}
                todayLocalDate={TODAY}
            />,
        );

        fireEvent.click(screen.getByText('Clear'));

        await waitFor(() => expect(onClose).toHaveBeenCalled());
    });
});

describe('HabitEntryDialog quantity/duration body', () => {
    it('shows the habit’s unit label next to the amount field', () => {
        const habit = buildHabit({ measure_kind: 'quantity', unit_code: 'km', target_value: 5000 });
        render(
            <HabitEntryDialog
                open
                onClose={vi.fn()}
                habit={habit}
                entries={[]}
                todayLocalDate={TODAY}
            />,
        );

        expect(screen.getByText('km')).toBeTruthy();
    });

    it('defaults a unit-less duration habit’s label to minutes', () => {
        const habit = buildHabit({ measure_kind: 'duration', unit_code: null, target_value: 600 });
        render(
            <HabitEntryDialog
                open
                onClose={vi.fn()}
                habit={habit}
                entries={[]}
                todayLocalDate={TODAY}
            />,
        );

        expect(screen.getByText('min')).toBeTruthy();
    });
});

describe('HabitEntryDialog back-fill navigation', () => {
    it('shows a date stepper only when allowDateNavigation is true', () => {
        const habit = buildHabit({ measure_kind: 'count', target_value: 20 });
        render(
            <HabitEntryDialog
                open
                onClose={vi.fn()}
                habit={habit}
                entries={[]}
                todayLocalDate={TODAY}
            />,
        );
        expect(screen.queryByLabelText('Previous day')).toBeNull();

        render(
            <HabitEntryDialog
                open
                onClose={vi.fn()}
                habit={habit}
                entries={[]}
                todayLocalDate={TODAY}
                allowDateNavigation
            />,
        );
        expect(screen.getAllByLabelText('Previous day').length).toBeGreaterThan(0);
    });

    it('re-prefills the amount from the newly selected day’s entry', () => {
        const habit = buildHabit({ measure_kind: 'count', target_value: 20 });
        const entries = [
            { id: 'entry-today', habit_id: 'habit-1', local_date: TODAY, value: 5 },
            { id: 'entry-yesterday', habit_id: 'habit-1', local_date: '2026-10-17', value: 9 },
        ];
        render(
            <HabitEntryDialog
                open
                onClose={vi.fn()}
                habit={habit}
                entries={entries}
                todayLocalDate={TODAY}
                allowDateNavigation
            />,
        );
        expect(screen.getByLabelText('Value').value).toBe('5');

        fireEvent.click(screen.getByLabelText('Previous day'));

        expect(screen.getByLabelText('Value').value).toBe('9');
    });
});
