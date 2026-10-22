import { describe, expect, it } from 'vitest';
import { rollingCompletionRate } from './rolling-completion-rate';

function buildOutcome(localDate, isSuccessful) {
    return { localDate, habitId: 'h1', isSuccessful };
}

describe('rollingCompletionRate', () => {
    it('returns an empty series for no outcomes', () => {
        expect(rollingCompletionRate([], 3)).toEqual([]);
    });

    it('averages only the outcomes seen so far before the window fills', () => {
        const outcomes = [buildOutcome('2026-10-01', true), buildOutcome('2026-10-02', false)];

        const rates = rollingCompletionRate(outcomes, 3);

        expect(rates).toEqual([
            { localDate: '2026-10-01', rate: 1 },
            { localDate: '2026-10-02', rate: 0.5 },
        ]);
    });

    it('slides the window once it has enough history', () => {
        const outcomes = [
            buildOutcome('2026-10-01', true),
            buildOutcome('2026-10-02', true),
            buildOutcome('2026-10-03', false),
            buildOutcome('2026-10-04', false),
        ];

        const rates = rollingCompletionRate(outcomes, 2);

        expect(rates.map((point) => point.rate)).toEqual([1, 1, 0.5, 0]);
    });

    it('handles a window size of 1 as the raw per-day outcome', () => {
        const outcomes = [buildOutcome('2026-10-01', true), buildOutcome('2026-10-02', false)];

        expect(rollingCompletionRate(outcomes, 1).map((point) => point.rate)).toEqual([1, 0]);
    });
});
