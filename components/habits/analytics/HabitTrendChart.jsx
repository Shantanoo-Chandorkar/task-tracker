'use client';

import { useMemo } from 'react';
import {
    CategoryScale,
    Chart as ChartJS,
    Filler,
    LinearScale,
    LineElement,
    PointElement,
    Tooltip as ChartTooltip,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useIsDarkTheme } from '@/hooks/useIsDarkTheme';
import { parseHexColor } from '@/lib/ui/color-contrast';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, ChartTooltip);

const AREA_FILL_ALPHA = 0.22;
const MAX_X_AXIS_TICKS = 6;
const DEFAULT_LINE_TENSION = 0.35;
const DEFAULT_VALUE_LABEL = 'rolling rate';

/**
 * A single habit's completion-rate series, rendered on `<canvas>` via Chart.js - period-agnostic.
 *
 * @param {object} props
 * @param {Array<{ localDate: string, rate: number }>} props.rates - A 0-1 rate per point, e.g.
 *   `rollingCompletionRate`'s result, or a raw per-day 0/1 series.
 * @param {string} props.ariaLabel - Accessible label for the chart as a whole.
 * @param {number} [props.tension] - Line curve smoothing, 0 (straight segments) to 1. Defaults to
 *   a smoothed curve; pass 0 for sharp binary data, where smoothing would overshoot the real values.
 * @param {string} [props.valueLabel] - Noun shown after the percentage in each point's tooltip;
 *   ignored when `tooltipLabels` is given.
 * @param {string[]} [props.tooltipLabels] - Full tooltip text per point, parallel to `rates`;
 *   overrides the default percentage tooltip entirely when given.
 */
export default function HabitTrendChart({
    rates,
    ariaLabel,
    tension = DEFAULT_LINE_TENSION,
    valueLabel = DEFAULT_VALUE_LABEL,
    tooltipLabels,
}) {
    // Unlike SVG/CSS, canvas can't follow --primary on its own - this just forces a re-resolve below.
    const isDark = useIsDarkTheme();

    const primaryColor = useMemo(() => {
        if (typeof window === 'undefined') return '#000000';
        return getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- isDark triggers the re-resolve, not read directly
    }, [isDark]);
    const [red, green, blue] = parseHexColor(primaryColor) ?? [0, 0, 0];

    const chartData = {
        labels: rates.map((point) => point.localDate),
        datasets: [
            {
                data: rates.map((point) => Math.round(point.rate * 100)),
                borderColor: primaryColor,
                backgroundColor: `rgba(${red}, ${green}, ${blue}, ${AREA_FILL_ALPHA})`,
                pointBackgroundColor: primaryColor,
                fill: true,
                tension,
                borderWidth: 2,
                pointRadius: 3,
                pointHoverRadius: 5,
            },
        ],
    };

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    label: (tooltipItem) =>
                        tooltipLabels
                            ? tooltipLabels[tooltipItem.dataIndex]
                            : `${tooltipItem.parsed.y}% ${valueLabel}`,
                },
            },
        },
        scales: {
            x: { grid: { display: false }, ticks: { maxTicksLimit: MAX_X_AXIS_TICKS } },
            y: { min: 0, max: 100, ticks: { callback: (tickValue) => `${tickValue}%` } },
        },
    };

    return (
        <div className="aspect-[2/1] w-full" role="img" aria-label={ariaLabel}>
            <Line data={chartData} options={chartOptions} />
        </div>
    );
}
