import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import HabitFormDialog from './HabitFormDialog';

// Radix Select positions its listbox with ResizeObserver and scrollIntoView, which jsdom lacks
beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
    Element.prototype.scrollIntoView = () => {};
});

const createHabit = vi.fn();
const updateHabit = vi.fn();
const clientIds = vi.hoisted(() => ({ counter: 0 }));

vi.mock('@/lib/client-id', () => ({
    createClientId: () => `client-id-${++clientIds.counter}`,
}));
vi.mock('@/modules/habits/actions/habit-actions', () => ({
    createHabit: (...args) => createHabit(...args),
    updateHabit: (...args) => updateHabit(...args),
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/components/custom/RichTextEditor', () => ({ default: () => null }));
vi.mock('@/hooks/useHabitCategoriesQuery', () => ({
    useHabitCategoriesQuery: () => ({
        data: [{ id: 'category-1', name: 'Health', color: '#111111' }],
    }),
}));
vi.mock('@/hooks/useIsDesktop', () => ({ useIsDesktop: () => true }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderDialog(props = {}) {
    const queryClient = new QueryClient();
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    return render(
        <QueryClientProvider client={queryClient}>
            <HabitFormDialog open onClose={vi.fn()} {...props} />
        </QueryClientProvider>,
    );
}

async function submitForm() {
    await act(async () => {
        fireEvent.submit(document.querySelector('form'));
    });
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => (clientIds.counter = 0));

describe('HabitFormDialog create mode', () => {
    it('refuses to submit without a title, without calling the action', async () => {
        renderDialog();

        await submitForm();

        expect(screen.getByText('Title is required')).toBeTruthy();
        expect(createHabit).not.toHaveBeenCalled();
    });

    it('creates a binary habit from just a title, with a client-made id', async () => {
        createHabit.mockResolvedValue({ data: { id: 'habit-1', title: 'Read' }, error: null });
        renderDialog();

        fireEvent.change(screen.getByPlaceholderText('Habit title'), {
            target: { value: 'Read' },
        });
        await submitForm();

        expect(createHabit).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Read', measure_kind: 'binary' }),
        );
        expect(createHabit.mock.calls[0][0].id).toBeTruthy();
    });

    it('hides the target value field for the default binary measure kind', () => {
        renderDialog();

        expect(screen.queryByText('Daily target')).toBeNull();
        expect(screen.getByRole('combobox', { name: /what are you tracking/i })).toBeTruthy();
    });

    it('shows the action’s error inside the form and keeps it open', async () => {
        createHabit.mockResolvedValue({ data: null, error: 'Title is required' });
        renderDialog();

        fireEvent.change(screen.getByPlaceholderText('Habit title'), {
            target: { value: 'Read' },
        });
        await submitForm();

        expect(await screen.findByText('Title is required')).toBeTruthy();
    });
});

describe('HabitFormDialog edit mode', () => {
    const existingHabit = {
        id: 'habit-1',
        title: 'Read',
        description: null,
        color: '#6b7280',
        category_id: null,
        polarity: 'build',
        measure_kind: 'binary',
        target_value: null,
        unit_code: null,
        recurrence: { kind: 'daily' },
        started_on: '2026-01-01',
    };

    it('prefills the form from the habit being edited', () => {
        renderDialog({ habit: existingHabit });

        expect(screen.getByPlaceholderText('Habit title').value).toBe('Read');
        expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
    });

    it('shows the target value field for a non-binary habit', () => {
        renderDialog({
            habit: { ...existingHabit, measure_kind: 'count', target_value: 20 },
        });

        expect(screen.getByText('Daily target')).toBeTruthy();
        expect(screen.getByRole('spinbutton').value).toBe('20');
    });

    it('sends an update with no client-made id', async () => {
        updateHabit.mockResolvedValue({
            data: { ...existingHabit, title: 'Read more' },
            error: null,
        });
        renderDialog({ habit: existingHabit });

        fireEvent.change(screen.getByPlaceholderText('Habit title'), {
            target: { value: 'Read more' },
        });
        await submitForm();

        expect(updateHabit).toHaveBeenCalledWith(
            'habit-1',
            expect.objectContaining({ title: 'Read more' }),
        );
        expect(updateHabit.mock.calls[0][1].id).toBeUndefined();
    });
});

function buildCountHabit(overrides = {}) {
    return {
        id: 'habit-1',
        title: 'Push-ups',
        description: null,
        color: '#6b7280',
        category_id: null,
        polarity: 'build',
        measure_kind: 'count',
        target_value: 20,
        unit_code: null,
        recurrence: { kind: 'daily' },
        started_on: '2026-01-01',
        ...overrides,
    };
}

describe('HabitFormDialog target value', () => {
    it('rejects a zero target value before ever calling the action, under Daily target', async () => {
        renderDialog({ habit: buildCountHabit({ target_value: 0 }) });

        await submitForm();

        expect(screen.getByText('Target value must be a positive number')).toBeTruthy();
        expect(updateHabit).not.toHaveBeenCalled();
    });

    it('allows a positive target value through to the action', async () => {
        updateHabit.mockResolvedValue({ data: buildCountHabit(), error: null });
        renderDialog({ habit: buildCountHabit() });

        await submitForm();

        expect(updateHabit).toHaveBeenCalledWith(
            'habit-1',
            expect.objectContaining({ target_value: 20 }),
        );
    });
});

describe('HabitFormDialog field-specific server errors', () => {
    it('maps a field-specific error under its own field, without the generic toast', async () => {
        updateHabit.mockResolvedValue({
            data: null,
            error: 'Unit cannot exceed 30 characters.',
            code: 'HABIT_UNIT_CODE_TOO_LONG',
        });
        renderDialog({ habit: buildCountHabit() });

        await submitForm();

        expect(await screen.findByText('Unit cannot exceed 30 characters.')).toBeTruthy();
        expect(toast.error).not.toHaveBeenCalled();
    });

    it('falls back to the generic toast and bottom error for an unmapped code', async () => {
        updateHabit.mockResolvedValue({ data: null, error: 'Something went wrong', code: 'XYZ' });
        renderDialog({ habit: buildCountHabit() });

        await submitForm();

        expect(await screen.findByText('Something went wrong')).toBeTruthy();
        expect(toast.error).toHaveBeenCalled();
    });
});

describe('HabitFormDialog measure-kind hint', () => {
    it('shows one hint for the current measure kind, not every kind at once', () => {
        renderDialog({ habit: buildCountHabit() });

        expect(screen.getByText('e.g. reps, glasses, pages.')).toBeTruthy();
        expect(
            screen.queryByText('e.g. distance, weight, volume - pick a unit or type your own.'),
        ).toBeNull();
    });
});

describe('HabitFormDialog canonical unit conversion', () => {
    it('prefills the target value in the stored unit, converted back from canonical storage', () => {
        renderDialog({
            habit: buildCountHabit({
                measure_kind: 'quantity',
                unit_code: 'km',
                target_value: 5000,
            }),
        });

        expect(screen.getByRole('spinbutton').value).toBe('5');
    });

    it('leaves a custom (non-built-in) unit’s target value unconverted', () => {
        renderDialog({
            habit: buildCountHabit({
                measure_kind: 'quantity',
                unit_code: 'cups',
                target_value: 8,
            }),
        });

        expect(screen.getByRole('spinbutton').value).toBe('8');
    });
});

describe('HabitFormDialog quit restricted to binary (decision B4)', () => {
    it('resets polarity to build when a non-binary measure kind is picked while quit', async () => {
        renderDialog({ habit: buildCountHabit({ polarity: 'quit', measure_kind: 'binary' }) });

        fireEvent.click(screen.getByRole('combobox', { name: /what are you tracking/i }));
        fireEvent.click(await screen.findByRole('option', { name: 'A count' }));

        expect(screen.getByRole('combobox', { name: /direction/i }).textContent).toBe(
            'Build this habit',
        );
    });

    it('resets the measure kind to binary when quit is picked while a non-binary kind is set', async () => {
        renderDialog({ habit: buildCountHabit() });

        fireEvent.click(screen.getByRole('combobox', { name: /direction/i }));
        fireEvent.click(await screen.findByRole('option', { name: 'Quit this habit' }));

        expect(screen.getByRole('combobox', { name: /what are you tracking/i }).textContent).toBe(
            'Yes / no',
        );
    });
});

describe('HabitFormDialog custom unit', () => {
    it('prefills a non-built-in stored unit into the custom unit text field', () => {
        renderDialog({
            habit: buildCountHabit({ measure_kind: 'quantity', unit_code: 'cups' }),
        });

        expect(screen.getByLabelText('Custom unit').value).toBe('cups');
    });

    it('does not show the custom unit field for a built-in stored unit', () => {
        renderDialog({
            habit: buildCountHabit({ measure_kind: 'quantity', unit_code: 'km' }),
        });

        expect(screen.queryByLabelText('Custom unit')).toBeNull();
    });

    it('sends the custom unit text as unit_code on submit', async () => {
        updateHabit.mockResolvedValue({ data: buildCountHabit(), error: null });
        renderDialog({
            habit: buildCountHabit({ measure_kind: 'quantity', unit_code: 'cups' }),
        });

        await submitForm();

        expect(updateHabit).toHaveBeenCalledWith(
            'habit-1',
            expect.objectContaining({ unit_code: 'cups' }),
        );
    });
});
