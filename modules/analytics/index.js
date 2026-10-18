/**
 * Public barrel for the analytics module (bucket D1 onward).
 * Other modules may reach analytics only through this file, never its internals.
 */

export {
    ANALYTICS_KPIS,
    computeCompletionRate,
    computeStreakSummary,
    computeConsistencyHeatmap,
    computeDayTimeDistribution,
    computeTotalTrackedTime,
} from './domain/index';
