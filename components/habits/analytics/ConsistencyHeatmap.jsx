import { computeConsistencyHeatmap } from '@/modules/analytics';
import { addDaysToLocalDate } from '@/modules/habits/domain/local-date';
import ConsistencyHeatmapGrid from './ConsistencyHeatmapGrid';

const MIN_DUE_CELL_OPACITY = 0.2;
const LEGEND_OPACITY_STEPS = [MIN_DUE_CELL_OPACITY, 0.45, 0.7, 1];
const EMPTY_CELL_CLASSES = 'border border-foreground/20 bg-transparent';
const CELL_SHAPE_CLASSES = 'h-[0.95rem] w-[0.95rem] rounded-[3px]';

const SIDE_BY_SIDE_WINDOWS = [
    { days: 7, label: 'Last 7 days', scrollable: false },
    { days: 30, label: 'Last 30 days', scrollable: true },
    { days: 90, label: 'Last 90 days', scrollable: true },
];
const YEARLY_WINDOW = { days: 365, label: 'Last 365 days', scrollable: true };

/**
 * Computes one window's `computeConsistencyHeatmap` result ending today.
 *
 * @param {object[]} activeHabits - Habits in scope.
 * @param {object[]} entries - `habit_entries` rows in scope.
 * @param {string} todayLocalDate - 'YYYY-MM-DD', the caller's current local date.
 * @param {number} days - Window length in days, inclusive of today.
 * @returns {Array<{ localDate: string, dueCount: number, successCount: number, completionRate:
 *   number|null }>} `computeConsistencyHeatmap`'s result for that window.
 */
function computeWindowHeatmap(activeHabits, entries, todayLocalDate, days) {
    const period = { start: addDaysToLocalDate(todayLocalDate, -(days - 1)), end: todayLocalDate };
    return computeConsistencyHeatmap(activeHabits, entries, period);
}

/**
 * Consistency heatmaps for 4 fixed windows (7/30/90/365 days) - decision 19's KPI 3.
 *
 * @param {object} props
 * @param {object[]} props.activeHabits - Active habits in scope.
 * @param {object[]} props.entries - This scope's `habit_entries` rows, any habit.
 * @param {string} props.todayLocalDate - 'YYYY-MM-DD', the caller's current local date.
 */
export default function ConsistencyHeatmap({ activeHabits, entries, todayLocalDate }) {
    if (activeHabits.length === 0) return null;

    const sideBySideGrids = SIDE_BY_SIDE_WINDOWS.map((periodWindow) => ({
        ...periodWindow,
        heatmap: computeWindowHeatmap(activeHabits, entries, todayLocalDate, periodWindow.days),
    }));
    const yearlyGrid = {
        ...YEARLY_WINDOW,
        heatmap: computeWindowHeatmap(activeHabits, entries, todayLocalDate, YEARLY_WINDOW.days),
    };

    return (
        <section className="rounded-xl bg-card p-4 space-y-3">
            <div>
                <h2 className="text-sm font-semibold text-foreground">Consistency</h2>
                <p className="text-xs text-muted-foreground">
                    How many of your due habits you completed, day by day.
                </p>
            </div>

            <div className="flex flex-wrap gap-4">
                {sideBySideGrids.map((windowGrid) => (
                    <ConsistencyHeatmapGrid
                        key={windowGrid.days}
                        label={windowGrid.label}
                        heatmap={windowGrid.heatmap}
                        scrollable={windowGrid.scrollable}
                    />
                ))}
            </div>

            <ConsistencyHeatmapGrid
                label={yearlyGrid.label}
                heatmap={yearlyGrid.heatmap}
                scrollable={yearlyGrid.scrollable}
            />

            <div className="flex items-center gap-2 text-[0.625rem] text-muted-foreground">
                <div className={`${CELL_SHAPE_CLASSES} ${EMPTY_CELL_CLASSES}`} aria-hidden="true" />
                <span>Nothing due</span>
                <span className="ml-2">Less</span>
                {LEGEND_OPACITY_STEPS.map((opacity) => (
                    <div
                        key={opacity}
                        className={`${CELL_SHAPE_CLASSES} bg-primary`}
                        style={{ opacity }}
                        aria-hidden="true"
                    />
                ))}
                <span>More</span>
            </div>
        </section>
    );
}
