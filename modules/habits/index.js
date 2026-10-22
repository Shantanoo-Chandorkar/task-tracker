/**
 * Public barrel for the habits module (bucket B1 onward).
 * Other modules may reach habits only through this file, never its internals.
 */

export {
    computeStreaks,
    computeCompletionCounts,
    isHabitDaySuccessful,
    computeHabitDayProgress,
    resolveEffectiveStartedOn,
} from './domain/streaks';
export { isDueOn, dueDatesBetween } from './domain/recurrence';
export { localDateRange, isLocalDateBefore, isLocalDateAfter } from './domain/local-date';
