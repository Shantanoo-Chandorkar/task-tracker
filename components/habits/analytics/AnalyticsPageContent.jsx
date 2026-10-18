'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useHabitsQuery } from '@/hooks/useHabitsQuery';
import { useHabitCategoriesQuery } from '@/hooks/useHabitCategoriesQuery';
import { useHabitEntriesQuery } from '@/hooks/useHabitEntriesQuery';
import { useTimeSessionsQuery } from '@/hooks/useTimeSessionsQuery';
import { getBrowserTodayLocalDate } from '@/modules/habits/domain/browser-local-date';
import {
    addDaysToLocalDate,
    isLocalDateBefore,
    localDateDiffInDays,
} from '@/modules/habits/domain/local-date';
import {
    computeCompletionRate,
    computeStreakSummary,
    computeDayTimeDistribution,
    computeTotalTrackedTime,
} from '@/modules/analytics';
import { Loader } from '@/components/custom/Loader';
import AnalyticsPeriodTabs from './AnalyticsPeriodTabs';
import CompletionRateSummary from './CompletionRateSummary';
import StreakSummaryList from './StreakSummaryList';
import ConsistencyHeatmap from './ConsistencyHeatmap';
import DayTimeDistributionCharts from './DayTimeDistributionCharts';
import TrackedTimeBreakdown from './TrackedTimeBreakdown';

const DEFAULT_PERIOD_DAYS = 30;

/**
 * The Habit Zone's analytics landing view - wires the five decision-19 KPI reducers to the
 * caller's own already-cached habits, entries and sessions, over a user-picked trailing window.
 */
export default function AnalyticsPageContent() {
    const [periodDays, setPeriodDays] = useState(DEFAULT_PERIOD_DAYS);
    const todayLocalDate = getBrowserTodayLocalDate();
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const { data: habits = [], isLoading: isLoadingHabits } = useHabitsQuery();
    const { data: categories = [] } = useHabitCategoriesQuery();
    const { data: entries = [], isLoading: isLoadingEntries } =
        useHabitEntriesQuery(todayLocalDate);
    const { data: sessions = [], isLoading: isLoadingSessions } = useTimeSessionsQuery();

    if (isLoadingHabits || isLoadingEntries || isLoadingSessions) {
        return (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader size="sm" />
                Loading your analytics...
            </div>
        );
    }

    const activeHabits = habits.filter((habit) => !habit.archived_at);
    if (activeHabits.length === 0) {
        return (
            <div className="space-y-3 py-12 text-center text-sm text-muted-foreground">
                <p>No habits yet. Start one to see your analytics here.</p>
                <Link
                    href="/habits"
                    className="rounded-lg border border-dashed border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/40 no-underline"
                >
                    Go to Habits
                </Link>
            </div>
        );
    }

    const period = {
        start: addDaysToLocalDate(todayLocalDate, -(periodDays - 1)),
        end: todayLocalDate,
    };
    const habitTitleById = new Map(activeHabits.map((habit) => [habit.id, habit.title]));

    const earliestStartedOn = activeHabits.reduce(
        (earliest, habit) =>
            !earliest || isLocalDateBefore(habit.started_on, earliest)
                ? habit.started_on
                : earliest,
        /** @type {string|null} */ (null),
    );
    const daysTracked = earliestStartedOn
        ? localDateDiffInDays(todayLocalDate, earliestStartedOn) + 1
        : 0;
    // Clamped to started_on, so a new habit's windows all look identical until it has more history.
    const isLowHistory = daysTracked > 0 && daysTracked <= 7;

    const completionRateBreakdown = computeCompletionRate(activeHabits, entries, period);
    const streakSummary = computeStreakSummary(activeHabits, entries, period);
    const distribution = computeDayTimeDistribution(
        activeHabits,
        entries,
        sessions,
        period,
        timeZone,
    );
    const trackedTime = computeTotalTrackedTime(activeHabits, sessions, period, new Date());

    // Span Completion Rate full-width when Streaks is empty, so no column sits blank.
    const hasStreaks = streakSummary.length > 0;

    return (
        <div className="space-y-4">
            <AnalyticsPeriodTabs periodDays={periodDays} onChange={setPeriodDays} />
            {isLowHistory && (
                <p className="text-xs text-muted-foreground">
                    You&apos;ve only been tracking for {daysTracked} day
                    {daysTracked === 1 ? '' : 's'} - longer windows will look the same as 7 days
                    until you have more history.
                </p>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className={hasStreaks ? '' : 'lg:col-span-2'}>
                    <CompletionRateSummary
                        completionRateBreakdown={completionRateBreakdown}
                        habitTitleById={habitTitleById}
                    />
                </div>
                <StreakSummaryList streakSummary={streakSummary} habitTitleById={habitTitleById} />
            </div>

            <ConsistencyHeatmap
                activeHabits={activeHabits}
                entries={entries}
                todayLocalDate={todayLocalDate}
            />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <DayTimeDistributionCharts distribution={distribution} />
                <TrackedTimeBreakdown
                    trackedTime={trackedTime}
                    categories={categories}
                    habitTitleById={habitTitleById}
                />
            </div>
        </div>
    );
}
