import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import ConsistencyHeatmapGrid from './ConsistencyHeatmapGrid';

describe('ConsistencyHeatmapGrid', () => {
    it('renders one cell per day', () => {
        const heatmap = [
            { localDate: '2026-10-01', dueCount: 1, successCount: 1, completionRate: 1 },
            { localDate: '2026-10-02', dueCount: 2, successCount: 1, completionRate: 0.5 },
            { localDate: '2026-10-03', dueCount: 0, successCount: 0, completionRate: null },
        ];

        render(<ConsistencyHeatmapGrid label="Last 7 days" heatmap={heatmap} />);

        expect(screen.getAllByRole('img')).toHaveLength(3);
    });

    it('gives a nothing-due day a distinct label from a 0%-due day', () => {
        const heatmap = [
            { localDate: '2026-10-01', dueCount: 1, successCount: 0, completionRate: 0 },
            { localDate: '2026-10-02', dueCount: 0, successCount: 0, completionRate: null },
        ];

        render(<ConsistencyHeatmapGrid label="Last 7 days" heatmap={heatmap} />);

        expect(screen.getByLabelText('2026-10-01: 0 / 1 completed (0%)')).toBeTruthy();
        expect(screen.getByLabelText('2026-10-02: Nothing due')).toBeTruthy();
    });

    it('renders nothing for an empty period', () => {
        const { container } = render(<ConsistencyHeatmapGrid label="Last 7 days" heatmap={[]} />);

        expect(container.firstChild).toBeNull();
    });

    it('shows the given label', () => {
        const heatmap = [
            { localDate: '2026-10-01', dueCount: 1, successCount: 1, completionRate: 1 },
        ];

        render(<ConsistencyHeatmapGrid label="Last 90 days" heatmap={heatmap} />);

        expect(screen.getByText('Last 90 days')).toBeTruthy();
    });
});
