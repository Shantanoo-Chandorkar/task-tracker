import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import HabitTrendChart from './HabitTrendChart';

// jsdom has no native canvas, so this covers only this app's job: shaping `rates` into chart props.
let lastLineProps = null;
vi.mock('react-chartjs-2', () => ({
    Line: (props) => {
        lastLineProps = props;
        return <div data-testid="mock-line" />;
    },
}));

// Backs useIsDarkTheme, read to resolve --primary - jsdom has no native implementation of it.
beforeAll(() => {
    window.matchMedia = () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
    });
});

const RATES = [
    { localDate: '2026-10-01', rate: 0 },
    { localDate: '2026-10-02', rate: 1 },
];

describe('HabitTrendChart', () => {
    it('renders the chart with an accessible label', () => {
        render(<HabitTrendChart rates={RATES} ariaLabel="Trend" />);

        expect(screen.getByRole('img', { name: 'Trend' })).toBeTruthy();
        expect(screen.getByTestId('mock-line')).toBeTruthy();
    });

    it('maps each rate into a percentage-scaled data point, in order', () => {
        render(<HabitTrendChart rates={RATES} ariaLabel="Trend" />);

        expect(lastLineProps.data.labels).toEqual(['2026-10-01', '2026-10-02']);
        expect(lastLineProps.data.datasets[0].data).toEqual([0, 100]);
    });

    it('fills the area under the line and locks the y-axis to 0-100%', () => {
        render(<HabitTrendChart rates={RATES} ariaLabel="Trend" />);

        expect(lastLineProps.data.datasets[0].fill).toBe(true);
        expect(lastLineProps.options.scales.y.min).toBe(0);
        expect(lastLineProps.options.scales.y.max).toBe(100);
    });

    it('defaults to a smoothed curve when tension is not passed', () => {
        render(<HabitTrendChart rates={RATES} ariaLabel="Trend" />);

        expect(lastLineProps.data.datasets[0].tension).toBe(0.35);
    });

    it('uses straight segments when tension is passed as 0', () => {
        render(<HabitTrendChart rates={RATES} ariaLabel="Trend" tension={0} />);

        expect(lastLineProps.data.datasets[0].tension).toBe(0);
    });

    it('defaults the tooltip label to "rolling rate" and honors a custom valueLabel', () => {
        render(<HabitTrendChart rates={RATES} ariaLabel="Trend" />);
        const defaultLabelCallback = lastLineProps.options.plugins.tooltip.callbacks.label;
        expect(defaultLabelCallback({ parsed: { y: 50 } })).toBe('50% rolling rate');

        render(<HabitTrendChart rates={RATES} ariaLabel="Trend" valueLabel="completed" />);
        const customLabelCallback = lastLineProps.options.plugins.tooltip.callbacks.label;
        expect(customLabelCallback({ parsed: { y: 50 } })).toBe('50% completed');
    });

    it('uses tooltipLabels verbatim, by point index, when given - ignoring valueLabel', () => {
        render(
            <HabitTrendChart
                rates={RATES}
                ariaLabel="Trend"
                valueLabel="completed"
                tooltipLabels={['12 of 20 min', 'Done']}
            />,
        );
        const labelCallback = lastLineProps.options.plugins.tooltip.callbacks.label;

        expect(labelCallback({ parsed: { y: 0 }, dataIndex: 0 })).toBe('12 of 20 min');
        expect(labelCallback({ parsed: { y: 100 }, dataIndex: 1 })).toBe('Done');
    });
});
