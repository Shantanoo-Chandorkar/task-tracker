import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
