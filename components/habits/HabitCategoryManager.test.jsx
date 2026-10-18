import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HabitCategoryManager from './HabitCategoryManager';

const categoriesData = vi.hoisted(() => ({
    data: [
        { id: 'category-1', name: 'Health', color: '#ff0000' },
        { id: 'category-2', name: 'Work', color: '#00ff00' },
    ],
    isLoading: false,
}));
const deleteHabitCategory = vi.fn();

vi.mock('@/hooks/useHabitCategoriesQuery', () => ({
    useHabitCategoriesQuery: () => categoriesData,
}));
vi.mock('@/modules/habits/actions/habit-category-actions', () => ({
    createHabitCategory: vi.fn(),
    updateHabitCategory: vi.fn(),
    deleteHabitCategory: (...args) => deleteHabitCategory(...args),
}));
vi.mock('@/hooks/useIsDesktop', () => ({ useIsDesktop: () => true }));
vi.mock('sonner', () => ({
    toast: { loading: () => 'toast-id', success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

function renderManager() {
    const queryClient = new QueryClient();
    return render(
        <QueryClientProvider client={queryClient}>
            <HabitCategoryManager />
        </QueryClientProvider>,
    );
}

function openRowMenu(categoryName) {
    fireEvent.pointerDown(
        screen.getByRole('button', { name: `More actions for ${categoryName}` }),
        {
            button: 0,
            ctrlKey: false,
        },
    );
}

beforeEach(() => {
    categoriesData.data = [
        { id: 'category-1', name: 'Health', color: '#ff0000' },
        { id: 'category-2', name: 'Work', color: '#00ff00' },
    ];
    categoriesData.isLoading = false;
});

describe('HabitCategoryManager', () => {
    it('shows the heading and every category', () => {
        renderManager();

        expect(screen.getByRole('heading', { name: 'Categories' })).toBeTruthy();
        expect(screen.getByText('Health')).toBeTruthy();
        expect(screen.getByText('Work')).toBeTruthy();
        expect(screen.getByRole('button', { name: '+ Add category' })).toBeTruthy();
    });

    it('shows the loading state, or the empty message, instead of a list', () => {
        categoriesData.isLoading = true;
        const { unmount } = renderManager();
        expect(screen.getByText('Loading categories...')).toBeTruthy();
        unmount();

        categoriesData.isLoading = false;
        categoriesData.data = [];
        renderManager();
        expect(screen.getByText('No categories yet.')).toBeTruthy();
    });

    it('opens the form for a new category, and for an existing one from its menu', async () => {
        renderManager();

        fireEvent.click(screen.getByRole('button', { name: '+ Add category' }));
        expect(screen.getByRole('dialog', { name: 'New category' })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        openRowMenu('Work');
        fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));
        expect(screen.getByRole('dialog', { name: 'Edit category' })).toBeTruthy();
        const nameInput = screen.getByPlaceholderText('Category name');
        expect(nameInput.value).toBe('Work');
    });

    it('deletes only after the confirm, warning that habits move to no category', async () => {
        deleteHabitCategory.mockResolvedValue({ error: null });
        renderManager();

        openRowMenu('Work');
        fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
        expect(
            screen.getByText(
                'Habits in this category keep their check-ins and move to no category.',
            ),
        ).toBeTruthy();
        expect(deleteHabitCategory).not.toHaveBeenCalled();

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        });

        await waitFor(() => expect(deleteHabitCategory).toHaveBeenCalledWith('category-2'));
    });

    it('keeps the popup open and shows the message when the delete is refused', async () => {
        deleteHabitCategory.mockResolvedValue({ error: 'Not allowed' });
        renderManager();

        openRowMenu('Work');
        fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        });

        expect(await screen.findByText('Not allowed')).toBeTruthy();
    });
});
