import { computeCompletionRate } from './completion-rate';
import { computeStreakSummary } from './streak-summary';
import { computeConsistencyHeatmap } from './consistency-heatmap';
import { computeDayTimeDistribution } from './day-time-distribution';
import { computeTotalTrackedTime } from './total-tracked-time';

export { computeCompletionRate } from './completion-rate';
export { computeStreakSummary } from './streak-summary';
export { computeConsistencyHeatmap } from './consistency-heatmap';
export { computeDayTimeDistribution } from './day-time-distribution';
export { computeTotalTrackedTime } from './total-tracked-time';

/**
 * The 80/20 KPI set (decision 19), registered by key so a sixth KPI is one file plus one line
 * here. Each `compute` function's own docblock is the source of truth for its exact signature -
 * they are not fully uniform (e.g. `computeTotalTrackedTime` also takes `now`), since forcing an
 * identical signature on every KPI would mean passing unused parameters to most of them.
 */
export const ANALYTICS_KPIS = [
    { key: 'completionRate', compute: computeCompletionRate },
    { key: 'streakSummary', compute: computeStreakSummary },
    { key: 'consistencyHeatmap', compute: computeConsistencyHeatmap },
    { key: 'dayTimeDistribution', compute: computeDayTimeDistribution },
    { key: 'totalTrackedTime', compute: computeTotalTrackedTime },
];
