'use client';

import { useState } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { useHabitsQuery } from '@/hooks/useHabitsQuery';
import { useHabitEntriesQuery } from '@/hooks/useHabitEntriesQuery';
import { useTimeSessionsQuery } from '@/hooks/useTimeSessionsQuery';
import { getBrowserTodayLocalDate } from '@/modules/habits/domain/browser-local-date';
import {
    addDaysToLocalDate,
    formatLocalDateForPill,
    isLocalDateAfter,
} from '@/modules/habits/domain/local-date';
import { resolveEffectiveStartedOn } from '@/modules/habits';
import { resolveHabitUnitLabel } from '@/modules/habits/domain/units';
import {
    computeCompletionRate,
    computeStreakSummary,
    computeTotalTrackedTime,
    computeConsistencyHeatmap,
    listDailyHabitOutcomes,
    rollingCompletionRate,
    formatRingFraction,
} from '@/modules/analytics';
import { formatElapsedDuration } from '@/modules/timer/domain/session-clock';
import { Loader } from '@/components/custom/Loader';
import { Button } from '@/components/ui/button';
import AnalyticsPeriodTabs from './AnalyticsPeriodTabs';
import CompletionRing from './CompletionRing';
import StatTile from './StatTile';
import HabitSwitcher from './HabitSwitcher';
import HabitTrendChart from './HabitTrendChart';
import ConsistencyHeatmapGrid from './ConsistencyHeatmapGrid';

const DEFAULT_PERIOD_DAYS = 30;
// Matches the approved design artifact's own values - each period gets a genuinely distinct window.
const TREND_WINDOW_SIZE_BY_PERIOD = { 7: 2, 30: 6, 90: 10 };

/**
 * The Daily-breakdown tooltip text for one due day, specific to the habit's polarity/measure_kind.
 *
 * @param {Record<string, any>} habit - Needs polarity, measure_kind, target_value.
 * @param {Record<string, any>|null} entry - That day's logged entry, or null if none.
 * @param {string|null} unitLabel - From `resolveHabitUnitLabel`.
 * @returns {string} The tooltip text.
 */
function describeDailyBreakdownEntry(habit, entry, unitLabel) {
    if (habit.polarity === 'quit') return entry ? 'Slipped' : 'Held';
    if (habit.measure_kind === 'binary') return entry ? 'Done' : 'Not done';
    const loggedValue = entry ? entry.value : 0;
    return unitLabel
        ? `${loggedValue} of ${habit.target_value} ${unitLabel}`
        : `${loggedValue} of ${habit.target_value}`;
}

/**
 * One habit's own analytics, filtered from the already-cached habits/entries/sessions queries.
 *
 * @param {object} props
 * @param {string} props.habitId - The habit to show; validated as a UUID by the route shell.
 */
export default function HabitAnalyticsDetail({ habitId }) {
    const [periodDays, setPeriodDays] = useState(DEFAULT_PERIOD_DAYS);
    const todayLocalDate = getBrowserTodayLocalDate();
    const habitsQuery = useHabitsQuery();
    const entriesQuery = useHabitEntriesQuery(todayLocalDate);
    const sessionsQuery = useTimeSessionsQuery();

    const isInitialLoading =
        (habitsQuery.isLoading && habitsQuery.data === undefined) ||
        (entriesQuery.isLoading && entriesQuery.data === undefined) ||
        (sessionsQuery.isLoading && sessionsQuery.data === undefined);
    if (isInitialLoading) {
        return (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader size="sm" />
                Loading this habit&apos;s analytics...
            </div>
        );
    }

    // A background refresh failure with existing cached data is already covered by the global
    // query-error toast (providers/QueryProvider.jsx) - this card is only for a first-load failure.
    const hasLoadFailure =
        (habitsQuery.isError && habitsQuery.data === undefined) ||
        (entriesQuery.isError && entriesQuery.data === undefined) ||
        (sessionsQuery.isError && sessionsQuery.data === undefined);
    if (hasLoadFailure) {
        return (
            <div className="rounded-md border border-border px-4 py-8 text-center">
                <p className="text-sm text-foreground mb-1">
                    Could not load this habit&apos;s analytics.
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                    Check your connection and try again.
                </p>
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                        habitsQuery.refetch();
                        entriesQuery.refetch();
                        sessionsQuery.refetch();
                    }}
                >
                    Try again
                </Button>
            </div>
        );
    }

    const habits = habitsQuery.data ?? [];
    const habit = habits.find((candidateHabit) => candidateHabit.id === habitId);
    if (!habit) notFound();

    const entries = entriesQuery.data ?? [];
    const sessions = sessionsQuery.data ?? [];
    const period = {
        start: addDaysToLocalDate(todayLocalDate, -(periodDays - 1)),
        end: todayLocalDate,
    };

    // True when this habit's real history starts later than the period's own nominal lookback.
    const effectiveStartedOn = resolveEffectiveStartedOn(habit, entries);
    const isWindowCapped = isLocalDateAfter(effectiveStartedOn, period.start);
    let cappedWindowNote = null;
    if (isWindowCapped) {
        const { month, day } = formatLocalDateForPill(effectiveStartedOn);
        cappedWindowNote = `Showing data from ${month} ${day} - this habit doesn't have ${periodDays} days of history yet.`;
    }

    const { overall } = computeCompletionRate([habit], entries, period);
    const [streakSummary] = computeStreakSummary([habit], entries, period);
    const { byHabitId: trackedSecondsByHabitId } = computeTotalTrackedTime(
        [habit],
        sessions,
        period,
        new Date(),
    );
    const trackedSeconds = trackedSecondsByHabitId[habitId] ?? 0;
    const trackedTimeValue =
        trackedSeconds > 0 ? formatElapsedDuration(trackedSeconds) : 'Not tracked';

    // listDailyHabitOutcomes (and so the heatmap/trend chart) structurally skips this recurrence
    // kind - it has no single due day, so a day-by-day consistency view doesn't apply to it.
    const isTimesPerWeek = habit.recurrence.kind === 'times_per_week';

    let consistencySection;
    let dailyBreakdownSection = null;
    if (isTimesPerWeek) {
        consistencySection = (
            <p className="text-sm text-muted-foreground">
                Consistency charts aren&apos;t available yet for times-per-week habits.
            </p>
        );
    } else if (periodDays === 365) {
        consistencySection = (
            <ConsistencyHeatmapGrid
                label="Last 365 days"
                heatmap={computeConsistencyHeatmap([habit], entries, period)}
                scrollable
            />
        );
    } else {
        const outcomes = listDailyHabitOutcomes([habit], entries, period);
        if (outcomes.length === 0) {
            consistencySection = (
                <p className="text-sm text-muted-foreground">
                    Not enough data yet - log a check-in to see this fill in.
                </p>
            );
        } else {
            const rates = rollingCompletionRate(outcomes, TREND_WINDOW_SIZE_BY_PERIOD[periodDays]);
            consistencySection = (
                <HabitTrendChart
                    rates={rates}
                    ariaLabel={`Rolling completion rate over the last ${periodDays} days`}
                />
            );

            const dailyRates = outcomes.map((outcome) => ({
                localDate: outcome.localDate,
                rate: outcome.progress,
            }));
            const entriesByHabitDate = new Map(
                entries
                    .filter((entry) => entry.habit_id === habitId)
                    .map((entry) => [entry.local_date, entry]),
            );
            const unitLabel = resolveHabitUnitLabel(habit);
            const tooltipLabels = outcomes.map((outcome) =>
                describeDailyBreakdownEntry(
                    habit,
                    entriesByHabitDate.get(outcome.localDate) ?? null,
                    unitLabel,
                ),
            );
            dailyBreakdownSection = (
                <HabitTrendChart
                    rates={dailyRates}
                    tooltipLabels={tooltipLabels}
                    ariaLabel={`Daily completion over the last ${periodDays} days`}
                />
            );
        }
    }

    return (
        <div className="space-y-4">
            <Link
                href="/habits/analytics"
                className="text-sm text-muted-foreground hover:text-foreground"
            >
                &lt; Back to habits
            </Link>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
                    <span
                        className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: habit.color }}
                        aria-hidden="true"
                    />
                    {habit.title}
                </h1>
                <HabitSwitcher habits={habits} currentHabitId={habitId} />
            </div>

            <AnalyticsPeriodTabs periodDays={periodDays} onChange={setPeriodDays} />
            {cappedWindowNote && (
                <p className="text-xs text-muted-foreground">{cappedWindowNote}</p>
            )}

            <div className="grid grid-cols-2 grid-rows-2 gap-3 md:grid-cols-4 md:grid-rows-1">
                <div className="flex flex-col items-center justify-center gap-2 rounded-xl bg-card p-4">
                    {overall.completionRate === null ? (
                        <p className="text-center text-sm text-muted-foreground">
                            Not enough data yet
                        </p>
                    ) : (
                        <>
                            <CompletionRing rate={overall.completionRate} />
                            <p className="text-center text-xs text-muted-foreground">
                                {formatRingFraction(
                                    overall.completedCount,
                                    overall.dueCount,
                                    'days',
                                )}
                            </p>
                        </>
                    )}
                </div>
                <StatTile label="Current streak" value={`${streakSummary.currentStreak}d`} />
                <StatTile label="Longest streak" value={`${streakSummary.longestStreak}d`} />
                <StatTile label="Tracked time" value={trackedTimeValue} />
            </div>

            {dailyBreakdownSection && (
                <section className="rounded-xl bg-card p-4 space-y-3">
                    <h2 className="text-sm font-semibold text-foreground">Daily breakdown</h2>
                    {dailyBreakdownSection}
                </section>
            )}

            <section className="rounded-xl bg-card p-4 space-y-3">
                <h2 className="text-sm font-semibold text-foreground">Consistency</h2>
                {consistencySection}
            </section>
        </div>
    );
}
