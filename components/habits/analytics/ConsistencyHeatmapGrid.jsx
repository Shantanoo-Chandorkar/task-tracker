import { getDay, parseISO } from 'date-fns';

const WEEKDAY_ROW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MIN_DUE_CELL_OPACITY = 0.2;
const EMPTY_CELL_CLASSES = 'border border-foreground/20 bg-transparent';
const CELL_SHAPE_CLASSES = 'h-[0.95rem] w-[0.95rem] rounded-[3px]';

/**
 * Describes one heatmap cell's class, style and text for a day's due/success counts - a day with
 * nothing due is a distinct bordered cell, never confused with a due day that scored 0%.
 *
 * @param {{ localDate: string, dueCount: number, successCount: number, completionRate: number|null }} day
 *   - One `computeConsistencyHeatmap` row.
 * @returns {{ className: string, style: object, label: string }}
 */
function describeCell(day) {
    if (day.dueCount === 0) {
        return { className: EMPTY_CELL_CLASSES, style: {}, label: 'Nothing due' };
    }
    const opacity = MIN_DUE_CELL_OPACITY + day.completionRate * (1 - MIN_DUE_CELL_OPACITY);
    return {
        className: 'bg-primary',
        style: { opacity },
        label: `${day.successCount} / ${day.dueCount} completed (${Math.round(day.completionRate * 100)}%)`,
    };
}

/**
 * Places each day in a GitHub-style weekday-row grid: leading blank cells pad the first column so
 * every day lands in its real weekday row once `grid-auto-flow: column` wraps into weeks.
 *
 * @param {Array<{ localDate: string }>} heatmap - Ascending-date rows from `computeConsistencyHeatmap`.
 * @returns {Array<{ localDate: string, dueCount: number, successCount: number, completionRate: number|null }|null>}
 *   The same rows, prefixed with `null` padding cells.
 */
function toWeekdayAlignedCells(heatmap) {
    if (heatmap.length === 0) return [];
    const firstWeekday = getDay(parseISO(heatmap[0].localDate));
    return [...Array.from({ length: firstWeekday }, () => null), ...heatmap];
}

/**
 * One GitHub-style weekday-row calendar grid for a single window - no legend of its own.
 *
 * @param {object} props
 * @param {string} props.label - Heading for this window, e.g. "Last 7 days".
 * @param {Array<{ localDate: string, dueCount: number, successCount: number, completionRate:
 *   number|null }>} props.heatmap - `computeConsistencyHeatmap`'s result for this window.
 * @param {boolean} [props.scrollable] - Wraps the grid in its own horizontal-scroll container for
 *   narrow viewports; omit for a window that's guaranteed to always fit (e.g. 7 days).
 */
export default function ConsistencyHeatmapGrid({ label, heatmap, scrollable = false }) {
    if (heatmap.length === 0) return null;
    const cells = toWeekdayAlignedCells(heatmap);

    const grid = (
        <div className="flex gap-1.5">
            <div
                className="grid shrink-0 gap-1 text-[0.625rem] text-muted-foreground"
                style={{ gridTemplateRows: 'repeat(7, 0.95rem)' }}
            >
                {WEEKDAY_ROW_LABELS.map((weekdayLabel, index) => (
                    <span key={weekdayLabel} className={index % 2 === 0 ? '' : 'invisible'}>
                        {weekdayLabel[0]}
                    </span>
                ))}
            </div>
            <div
                className="grid grid-flow-col gap-1"
                style={{ gridTemplateRows: 'repeat(7, 0.95rem)' }}
            >
                {cells.map((day, index) => {
                    if (!day) return <div key={`pad-${index}`} aria-hidden="true" />;
                    const cell = describeCell(day);
                    return (
                        <div
                            key={day.localDate}
                            role="img"
                            aria-label={`${day.localDate}: ${cell.label}`}
                            title={`${day.localDate}: ${cell.label}`}
                            className={`${CELL_SHAPE_CLASSES} ${cell.className}`}
                            style={cell.style}
                        />
                    );
                })}
            </div>
        </div>
    );

    return (
        <div className="min-w-0 space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            {scrollable ? <div className="min-w-0 overflow-x-auto pb-1">{grid}</div> : grid}
        </div>
    );
}
