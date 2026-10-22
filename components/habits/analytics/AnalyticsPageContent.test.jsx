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
    entries: [],
    sessions: [],
    isLoading: false,
}));

vi.mock('@/hooks/useHabitsQuery', () => ({
    useHabitsQuery: () => ({ data: queryState.habits, isLoading: queryState.isLoading }),
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
        color: '#60a5fa',
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

        expect(screen.getByText('Habits')).toBeTruthy();
        expect(screen.getByText('Completion rate')).toBeTruthy();
        expect(screen.getByText('Streaks')).toBeTruthy();
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

    it('lists every active habit with a working link to its own analytics page', () => {
        queryState.habits = [buildHabit(), buildHabit({ id: 'h2', title: 'Read before bed' })];
        renderWithQueryClient();

        const habitsSection = screen.getByText('Habits').closest('section');
        expect(within(habitsSection).getByText('Meditate')).toBeTruthy();
        expect(within(habitsSection).getByText('Read before bed')).toBeTruthy();

        const links = within(habitsSection).getAllByRole('link', { name: 'View analytics >' });
        expect(links.map((link) => link.getAttribute('href'))).toEqual([
            '/habits/analytics/h1',
            '/habits/analytics/h2',
        ]);
    });

    it('excludes an archived habit from the Habits launch list', () => {
        queryState.habits = [
            buildHabit(),
            buildHabit({ id: 'h2', title: 'Retired habit', archived_at: '2026-10-01T00:00:00Z' }),
        ];
        renderWithQueryClient();

        const habitsSection = screen.getByText('Habits').closest('section');
        expect(within(habitsSection).getByText('Meditate')).toBeTruthy();
        expect(within(habitsSection).queryByText('Retired habit')).toBeNull();
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
