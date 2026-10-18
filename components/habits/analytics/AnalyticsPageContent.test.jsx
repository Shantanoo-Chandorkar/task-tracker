import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AnalyticsPageContent from './AnalyticsPageContent';

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
});

const queryState = vi.hoisted(() => ({
    habits: [],
    categories: [],
    entries: [],
    sessions: [],
    isLoading: false,
}));

vi.mock('@/hooks/useHabitsQuery', () => ({
    useHabitsQuery: () => ({ data: queryState.habits, isLoading: queryState.isLoading }),
}));
vi.mock('@/hooks/useHabitCategoriesQuery', () => ({
    useHabitCategoriesQuery: () => ({ data: queryState.categories, isLoading: false }),
}));
vi.mock('@/hooks/useHabitEntriesQuery', () => ({
    useHabitEntriesQuery: () => ({ data: queryState.entries, isLoading: queryState.isLoading }),
}));
vi.mock('@/hooks/useTimeSessionsQuery', () => ({
    useTimeSessionsQuery: () => ({ data: queryState.sessions, isLoading: queryState.isLoading }),
}));
vi.mock('@/modules/habits/domain/browser-local-date', () => ({
    getBrowserTodayLocalDate: () => '2026-10-18',
}));

afterEach(() => {
    cleanup();
    queryState.habits = [];
    queryState.categories = [];
    queryState.entries = [];
    queryState.sessions = [];
    queryState.isLoading = false;
});

function renderWithQueryClient() {
    const queryClient = new QueryClient();
    return render(
        <QueryClientProvider client={queryClient}>
            <AnalyticsPageContent />
        </QueryClientProvider>,
    );
}

function buildHabit(overrides = {}) {
    return {
        id: 'h1',
        user_id: 'user-1',
        title: 'Meditate',
        category_id: null,
        polarity: 'build',
        measure_kind: 'binary',
        target_value: null,
        recurrence: { kind: 'daily' },
        started_on: '2026-09-01',
        archived_at: null,
        ...overrides,
    };
}

describe('AnalyticsPageContent', () => {
    it('shows a loading state while any query is in flight', () => {
        queryState.isLoading = true;
        renderWithQueryClient();

        expect(screen.getByText('Loading your analytics...')).toBeTruthy();
    });

    it('shows an empty state with a link back to Habits when there are no habits', () => {
        renderWithQueryClient();

        expect(
            screen.getByText('No habits yet. Start one to see your analytics here.'),
        ).toBeTruthy();
        const habitsLink = screen.getByRole('link', { name: 'Go to Habits' });
        expect(habitsLink.getAttribute('href')).toBe('/habits');
    });

    it('renders every KPI section and recomputes when the period changes', () => {
        queryState.habits = [buildHabit()];
        queryState.entries = [{ habit_id: 'h1', local_date: '2026-10-18', value: 1 }];
        renderWithQueryClient();

        expect(screen.getByText('Completion rate')).toBeTruthy();
        expect(screen.getByText('Streaks')).toBeTruthy();
        expect(screen.getByText('Consistency')).toBeTruthy();
        expect(screen.getByText('Successes by weekday')).toBeTruthy();
        expect(screen.getByText('No duration habits tracked yet')).toBeTruthy();

        const sevenDayTab = screen.getByRole('tab', { name: 'Last 7 days' });
        fireEvent.click(sevenDayTab);

        expect(sevenDayTab.getAttribute('aria-selected')).toBe('true');
    });

    it('offers a yearly period tab alongside 7/30/90 days', () => {
        queryState.habits = [buildHabit()];
        queryState.entries = [{ habit_id: 'h1', local_date: '2026-10-18', value: 1 }];
        renderWithQueryClient();

        const yearlyTab = screen.getByRole('tab', { name: 'Last 365 days' });
        fireEvent.click(yearlyTab);

        expect(yearlyTab.getAttribute('aria-selected')).toBe('true');
    });

    it('keeps showing Consistency regardless of which top-level period tab is selected', () => {
        queryState.habits = [buildHabit()];
        queryState.entries = [{ habit_id: 'h1', local_date: '2026-10-18', value: 1 }];
        renderWithQueryClient();

        fireEvent.click(screen.getByRole('tab', { name: 'Last 90 days' }));

        const consistencySection = screen.getByText('Consistency').closest('section');
        expect(consistencySection).toBeTruthy();
        expect(within(consistencySection).getByText('Last 30 days')).toBeTruthy();
    });

    it('explains why every period looks the same when a habit is brand new', () => {
        queryState.habits = [buildHabit({ started_on: '2026-10-17' })];
        queryState.entries = [{ habit_id: 'h1', local_date: '2026-10-18', value: 1 }];
        renderWithQueryClient();

        expect(
            screen.getByText(
                "You've only been tracking for 2 days - longer windows will look the same as 7 days until you have more history.",
            ),
        ).toBeTruthy();
    });

    it('does not show the low-history note once a habit has more than a week of history', () => {
        queryState.habits = [buildHabit({ started_on: '2026-09-01' })];
        queryState.entries = [{ habit_id: 'h1', local_date: '2026-10-18', value: 1 }];
        renderWithQueryClient();

        expect(screen.queryByText(/You've only been tracking for/)).toBeNull();
    });
});
