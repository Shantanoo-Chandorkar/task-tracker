import { describe, expect, it } from 'vitest';
import { ANALYTICS_KPIS } from './index';

describe('ANALYTICS_KPIS', () => {
    it('registers exactly the 80/20 KPI set from decision 19', () => {
        expect(ANALYTICS_KPIS.map((kpi) => kpi.key)).toEqual([
            'completionRate',
            'streakSummary',
            'consistencyHeatmap',
            'dayTimeDistribution',
            'totalTrackedTime',
        ]);
    });

    it('registers a callable compute function for every KPI', () => {
        for (const kpi of ANALYTICS_KPIS) {
            expect(typeof kpi.compute).toBe('function');
        }
    });
});
