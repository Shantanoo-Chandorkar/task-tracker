import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HabitListView from './HabitListView';

// Radix Select positions its listbox with ResizeObserver and scrollIntoView, which jsdom lacks
beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
    Element.prototype.scrollIntoView = () => {};
});

const habits = [
    buildHabit('habit-daily', { title: 'Meditate', recurrence: { kind: 'daily' } }),
    buildHabit('habit-monday', {
        title: 'Gym',
        category_id: 'category-1',
        recurrence: { kind: 'weekdays', days: [1, 2, 3] },
    }),
    buildHabit('habit-saturday', {
        title: 'Long run',
        recurrence: { kind: 'weekdays', days: [6] },
    }),
];
const categories = [{ id: 'category-1', name: 'Health', color: '#111111' }];

function buildHabit(id, overrides = {}) {
    return {
        id,
        user_id: 'user-1',
        category_id: null,
        title: 'Habit',
        description: null,
        color: '#6b7280',
        position: 0,
        polarity: 'build',
        measure_kind: 'binary',
        target_value: null,
        unit_code: null,
        recurrence: { kind: 'daily' },
        started_on: '2026-01-01',
        archived_at: null,
        ...overrides,
    };
}

const useHabitsQuery = vi.fn(() => ({ data: habits, isLoading: false }));
vi.mock('@/hooks/useHabitsQuery', () => ({ useHabitsQuery: (...args) => useHabitsQuery(...args) }));
vi.mock('@/hooks/useHabitCategoriesQuery', () => ({
    useHabitCategoriesQuery: () => ({ data: categories }),
}));
vi.mock('@/hooks/useHabitEntriesQuery', () => ({
    useHabitEntriesQuery: () => ({ data: [], isLoading: false }),
}));
const deleteHabit = vi.fn();
vi.mock('@/modules/habits/actions/habit-actions', () => ({
    createHabit: vi.fn(),
    updateHabit: vi.fn(),
    deleteHabit: (...args) => deleteHabit(...args),
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/components/custom/RichTextEditor', () => ({ default: () => null }));
vi.mock('@/hooks/useIsDesktop', () => ({ useIsDesktop: () => true }));
vi.mock('sonner', () => ({
    toast: { loading: () => 'toast-id', success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));

/** @param {string} habitTitle */
function openRowMenu(habitTitle) {
    fireEvent.pointerDown(screen.getByRole('button', { name: `More actions for ${habitTitle}` }), {
        button: 0,
        ctrlKey: false,
    });
}

function renderView() {
    const queryClient = new QueryClient();
    return render(
        <QueryClientProvider client={queryClient}>
            <HabitListView />
        </QueryClientProvider>,
    );
}

beforeEach(() => {
    vi.useFakeTimers();
    // A Monday, so the weekdays [1,2,3] habit is due and the [6] one is not.
    vi.setSystemTime(new Date(2026, 9, 19, 12, 0, 0));
});
afterEach(() => vi.useRealTimers());

describe('HabitListView today tab', () => {
    it('shows only habits due today, by default', () => {
        renderView();

        expect(screen.getByText('Meditate')).toBeTruthy();
        expect(screen.getByText('Gym')).toBeTruthy();
        expect(screen.queryByText('Long run')).toBeNull();
    });

    it('offers to start a habit when none are due today', () => {
        // Sunday - matches neither the Mon/Tue/Wed nor the Saturday-only habit below
        useHabitsQuery.mockReturnValueOnce({ data: habits.slice(1), isLoading: false });
        vi.setSystemTime(new Date(2026, 9, 25, 12, 0, 0));
        renderView();

        expect(screen.getByText(/No habits due today\. Start one now\./)).toBeTruthy();
        expect(screen.getByText('+ Start a habit')).toBeTruthy();
    });
});

describe('HabitListView all tab', () => {
    it('shows every active habit regardless of today', () => {
        renderView();

        act(() => fireEvent.click(screen.getByRole('tab', { name: 'All' })));

        expect(screen.getByText('Meditate')).toBeTruthy();
        expect(screen.getByText('Gym')).toBeTruthy();
        expect(screen.getByText('Long run')).toBeTruthy();
    });
});

describe('HabitListView by-category tab', () => {
    it('groups habits under their category, with an Uncategorized group last', () => {
        renderView();

        act(() => fireEvent.click(screen.getByRole('tab', { name: 'By Category' })));

        const headings = screen
            .getAllByRole('heading', { level: 2 })
            .map((node) => node.textContent);
        expect(headings).toEqual(['Health', 'Uncategorized']);
    });
});

describe('HabitListView empty state', () => {
    it('opens the create-habit dialog from the empty-state button', () => {
        useHabitsQuery.mockReturnValueOnce({ data: [], isLoading: false });
        renderView();

        act(() => fireEvent.click(screen.getByText('+ Start a habit')));

        expect(screen.getByRole('heading', { name: 'New habit' })).toBeTruthy();
    });
});

describe('HabitListView edit/delete parity', () => {
    // Radix's dropdown menu and RTL's findBy* queries both rely on real timers to settle.
    beforeEach(() => vi.useRealTimers());

    it('opens the edit dialog pre-filled from a row menu', async () => {
        renderView();

        openRowMenu('Meditate');
        fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));

        expect(screen.getByRole('heading', { name: 'Edit habit' })).toBeTruthy();
        expect(screen.getByPlaceholderText('Habit title').value).toBe('Meditate');
    });

    it('deletes only after confirming, warning the delete cascades to check-ins', async () => {
        deleteHabit.mockResolvedValue({ error: null });
        renderView();

        openRowMenu('Meditate');
        fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
        expect(
            screen.getByText(
                "This also deletes every check-in logged for it. This can't be undone.",
            ),
        ).toBeTruthy();
        expect(deleteHabit).not.toHaveBeenCalled();

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        });

        await waitFor(() => expect(deleteHabit).toHaveBeenCalledWith('habit-daily'));
    });

    it('keeps the popup open and shows the message when the delete is refused', async () => {
        deleteHabit.mockResolvedValue({ error: 'Not allowed' });
        renderView();

        openRowMenu('Meditate');
        fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        });

        expect(await screen.findByText('Not allowed')).toBeTruthy();
    });
});
