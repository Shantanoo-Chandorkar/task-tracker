/**
 * Trailing-window success rate over a single habit's due-day outcomes.
 * Windowed by due-day position, not calendar days, since there is no outcome for a non-due day.
 *
 * @param {Array<{ localDate: string, isSuccessful: boolean }>} outcomes - A single habit's
 *   `listDailyHabitOutcomes` result, ascending by `localDate`.
 * @param {number} windowSize - How many trailing due-days each point's rate averages over.
 * @returns {Array<{ localDate: string, rate: number }>} One point per outcome, same order.
 */
export function rollingCompletionRate(outcomes, windowSize) {
    return outcomes.map((outcome, index) => {
        const windowStart = Math.max(0, index - windowSize + 1);
        const windowOutcomes = outcomes.slice(windowStart, index + 1);
        const successCount = windowOutcomes.filter(
            (windowOutcome) => windowOutcome.isSuccessful,
        ).length;
        return { localDate: outcome.localDate, rate: successCount / windowOutcomes.length };
    });
}
