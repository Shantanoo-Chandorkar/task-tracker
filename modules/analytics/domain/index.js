import { computeCompletionRate } from './completion-rate';
import { computeStreakSummary } from './streak-summary';
import { computeConsistencyHeatmap } from './consistency-heatmap';
import { computeTotalTrackedTime } from './total-tracked-time';

export { computeCompletionRate } from './completion-rate';
export { computeStreakSummary } from './streak-summary';
export { computeConsistencyHeatmap } from './consistency-heatmap';
export { computeTotalTrackedTime } from './total-tracked-time';

/**
 * The KPI set with a live UI consumer (decision 19 catalog, pruned per decision 27).
 * Each compute function keeps its own signature - forcing uniformity would pass unused params.
 */
export const ANALYTICS_KPIS = [
    { key: 'completionRate', compute: computeCompletionRate },
    { key: 'streakSummary', compute: computeStreakSummary },
    { key: 'consistencyHeatmap', compute: computeConsistencyHeatmap },
    { key: 'totalTrackedTime', compute: computeTotalTrackedTime },
];
