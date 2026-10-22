import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import HabitAnalyticsDetail from './HabitAnalyticsDetail';

// HabitSwitcher (Radix Select) mounts in every case here, and needs these even when untouched.
// matchMedia backs useIsDarkTheme, read whenever HabitTrendChart mounts - jsdom lacks it natively.
beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
    Element.prototype.scrollIntoView = () => {};
    window.matchMedia = () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
    });
});

// Captures each mounted instance's props, so a test can confirm the right data reached it.
let mockLineCalls = [];
vi.mock('react-chartjs-2', () => ({
    Line: (props) => {
        mockLineCalls.push(props);
        return <div data-testid="mock-trend-chart" />;
    },
}));

const notFoundSpy = vi.hoisted(() =>
    vi.fn(() => {
        throw new Error('NEXT_NOT_FOUND');
    }),
);
const routerPush = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
    notFound: notFoundSpy,
    useRouter: () => ({ push: routerPush }),
}));

function buildQueryResult(overrides = {}) {
    return { data: [], isLoading: false, isError: false, refetch: vi.fn(), ...overrides };
}

const queryState = vi.hoisted(() => ({
    habits: { data: [], isLoading: false, isError: false, refetch: vi.fn() },
    entries: { data: [], isLoading: false, isError: false, refetch: vi.fn() },
    sessions: { data: [], isLoading: false, isError: false, refetch: vi.fn() },
}));

vi.mock('@/hooks/useHabitsQuery', () => ({ useHabitsQuery: () => queryState.habits }));
vi.mock('@/hooks/useHabitEntriesQuery', () => ({ useHabitEntriesQuery: () => queryState.entries }));
vi.mock('@/hooks/useTimeSessionsQuery', () => ({
    useTimeSessionsQuery: () => queryState.sessions,
}));
vi.mock('@/modules/habits/domain/browser-local-date', () => ({
    getBrowserTodayLocalDate: () => '2026-10-18',
}));

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

function buildDailyEntries(habitId, days) {
    const entries = [];
    for (let i = 0; i < days; i += 1) {
        const date = new Date('2026-10-18T00:00:00Z');
        date.setUTCDate(date.getUTCDate() - i);
        entries.push({
            habit_id: habitId,
            local_date: date.toISOString().slice(0, 10),
            value: 1,
        });
    }
    return entries;
}

afterEach(() => {
    cleanup();
    notFoundSpy.mockClear();
    routerPush.mockClear();
    mockLineCalls = [];
    queryState.habits = buildQueryResult();
    queryState.entries = buildQueryResult();
    queryState.sessions = buildQueryResult();
});

describe('HabitAnalyticsDetail', () => {
    it('shows a loading state while a query has no data yet', () => {
        queryState.habits = buildQueryResult({ data: undefined, isLoading: true });
        render(<HabitAnalyticsDetail habitId="h1" />);

        expect(screen.getByText("Loading this habit's analytics...")).toBeTruthy();
    });

    it('shows a retry card when a query fails with no data, and retry refetches all three', () => {
        queryState.habits = buildQueryResult({ data: undefined, isError: true });
        render(<HabitAnalyticsDetail habitId="h1" />);

        expect(screen.getByText("Could not load this habit's analytics.")).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(queryState.habits.refetch).toHaveBeenCalledOnce();
        expect(queryState.entries.refetch).toHaveBeenCalledOnce();
        expect(queryState.sessions.refetch).toHaveBeenCalledOnce();
    });

    it('calls notFound when no habit matches the id', () => {
        queryState.habits.data = [buildHabit({ id: 'other' })];

        // React double-invokes a throwing render in development to produce a clean stack trace.
        expect(() => render(<HabitAnalyticsDetail habitId="h1" />)).toThrow('NEXT_NOT_FOUND');
        expect(notFoundSpy).toHaveBeenCalled();
    });

    it('resolves an archived habit instead of treating it as not found', () => {
        queryState.habits.data = [buildHabit({ archived_at: '2026-10-01T00:00:00Z' })];
        render(<HabitAnalyticsDetail habitId="h1" />);

        expect(screen.getByText('Meditate')).toBeTruthy();
        expect(notFoundSpy).not.toHaveBeenCalled();
    });

    it("renders the resolved habit's title, streaks, and tracked time", () => {
        queryState.habits.data = [buildHabit()];
        queryState.entries.data = buildDailyEntries('h1', 10);
        render(<HabitAnalyticsDetail habitId="h1" />);

        expect(screen.getByRole('heading', { name: 'Meditate' })).toBeTruthy();
        expect(screen.getByText('Current streak')).toBeTruthy();
        expect(screen.getByText('Longest streak')).toBeTruthy();
        expect(screen.getByText('Tracked time')).toBeTruthy();
        expect(screen.getByText('Not tracked')).toBeTruthy();
    });

    it('shows a specific message for a times-per-week habit instead of a chart', () => {
        queryState.habits.data = [
            buildHabit({ recurrence: { kind: 'times_per_week', timesPerWeek: 3 } }),
        ];
        render(<HabitAnalyticsDetail habitId="h1" />);

        expect(
            screen.getByText("Consistency charts aren't available yet for times-per-week habits."),
        ).toBeTruthy();
    });

    it('shows an empty state for a habit with no due days in the period yet', () => {
        // started_on is after "today" in this test, so the period has zero due days.
        queryState.habits.data = [buildHabit({ started_on: '2026-10-19' })];
        queryState.entries.data = [];
        render(<HabitAnalyticsDetail habitId="h1" />);

        expect(
            screen.getByText('Not enough data yet - log a check-in to see this fill in.'),
        ).toBeTruthy();
    });

    it('switches to the heatmap at the 365-day period tab', () => {
        queryState.habits.data = [buildHabit()];
        queryState.entries.data = buildDailyEntries('h1', 10);
        render(<HabitAnalyticsDetail habitId="h1" />);

        fireEvent.click(screen.getByRole('tab', { name: 'Last 365 days' }));

        // The tab itself says "Last 365 days" too, so the heatmap grid's own label is the 2nd match.
        expect(screen.getAllByText('Last 365 days').length).toBeGreaterThan(1);
        expect(screen.queryByText('Daily breakdown')).toBeNull();
        expect(screen.queryAllByTestId('mock-trend-chart').length).toBe(0);
    });

    it('renders a daily-breakdown card above the trend chart at a non-365 period', () => {
        queryState.habits.data = [buildHabit()];
        queryState.entries.data = buildDailyEntries('h1', 10);
        render(<HabitAnalyticsDetail habitId="h1" />);

        expect(screen.getByText('Daily breakdown')).toBeTruthy();
        expect(screen.getByText('Consistency')).toBeTruthy();
        expect(screen.getAllByTestId('mock-trend-chart').length).toBe(2);
    });

    it("shows a capped-window note when the habit's history starts after the period's nominal start", () => {
        queryState.habits.data = [buildHabit({ started_on: '2026-10-10' })];
        queryState.entries.data = buildDailyEntries('h1', 5);
        render(<HabitAnalyticsDetail habitId="h1" />);

        expect(
            screen.getByText(
                "Showing data from Oct 10 - this habit doesn't have 30 days of history yet.",
            ),
        ).toBeTruthy();
    });

    it('does not show a capped-window note when the habit already covers the full period', () => {
        queryState.habits.data = [buildHabit()];
        queryState.entries.data = buildDailyEntries('h1', 10);
        render(<HabitAnalyticsDetail habitId="h1" />);

        expect(screen.queryByText(/doesn't have 30 days of history yet/)).toBeNull();
    });

    it("gives a quantified habit's daily breakdown a real fraction and a specific tooltip", () => {
        queryState.habits.data = [
            buildHabit({ measure_kind: 'duration', unit_code: 'min', target_value: 1200 }),
        ];
        queryState.entries.data = [{ habit_id: 'h1', local_date: '2026-10-18', value: 720 }];
        render(<HabitAnalyticsDetail habitId="h1" />);

        // mockLineCalls[0] is the Daily-breakdown instance (rendered above Trend in the markup).
        const dailyBreakdownProps = mockLineCalls[0];
        expect(dailyBreakdownProps.data.datasets[0].data).toContain(60);
        const labelCallback = dailyBreakdownProps.options.plugins.tooltip.callbacks.label;
        const pointIndex = dailyBreakdownProps.data.labels.indexOf('2026-10-18');
        expect(labelCallback({ parsed: { y: 60 }, dataIndex: pointIndex })).toBe('720 of 1200 min');
    });

    it("binary and quit habits' daily breakdown is unaffected: still a flat pass/fail", () => {
        queryState.habits.data = [buildHabit({ polarity: 'quit' })];
        queryState.entries.data = [];
        render(<HabitAnalyticsDetail habitId="h1" />);

        const dailyBreakdownProps = mockLineCalls[0];
        expect(dailyBreakdownProps.data.datasets[0].data.every((value) => value === 100)).toBe(
            true,
        );
    });

    it('uses the same curve smoothing for the daily-breakdown and trend charts', () => {
        queryState.habits.data = [buildHabit()];
        queryState.entries.data = buildDailyEntries('h1', 10);
        render(<HabitAnalyticsDetail habitId="h1" />);

        const [dailyBreakdownProps, trendProps] = mockLineCalls;
        expect(dailyBreakdownProps.data.datasets[0].tension).toBe(
            trendProps.data.datasets[0].tension,
        );
    });
});
