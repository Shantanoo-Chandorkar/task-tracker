/**
 * Public barrel for the analytics module (bucket D1 onward).
 * Other modules may reach analytics only through this file, never its internals.
 */

export {
    ANALYTICS_KPIS,
    computeCompletionRate,
    computeStreakSummary,
    computeConsistencyHeatmap,
    computeTotalTrackedTime,
} from './domain/index';
export { listDailyHabitOutcomes } from './domain/daily-habit-outcomes';
export { rollingCompletionRate } from './domain/rolling-completion-rate';
export { formatRingFraction } from './domain/format-ring-fraction';
export { buildConicGradientStops } from './domain/build-conic-gradient-stops';
