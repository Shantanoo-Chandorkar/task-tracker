const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOUR_BUCKET_SIZE = 4;
const HOUR_BUCKET_COUNT = 24 / HOUR_BUCKET_SIZE;
const BAR_ROW_HEIGHT_PX = 96;

/**
 * Groups 24 hourly counts into 4-hour buckets so the chart stays readable at 360px width.
 *
 * @param {Array<{ hour: number, sessionCount: number }>} byHourOfDay - One entry per hour, 0-23.
 * @returns {Array<{ label: string, sessionCount: number }>} One entry per 4-hour bucket.
 */
function groupIntoHourBuckets(byHourOfDay) {
    const buckets = [];
    for (let bucketIndex = 0; bucketIndex < HOUR_BUCKET_COUNT; bucketIndex += 1) {
        const startHour = bucketIndex * HOUR_BUCKET_SIZE;
        const hoursInBucket = byHourOfDay.slice(startHour, startHour + HOUR_BUCKET_SIZE);
        const sessionCount = hoursInBucket.reduce((sum, hour) => sum + hour.sessionCount, 0);
        buckets.push({ label: `${startHour}:00`, sessionCount });
    }
    return buckets;
}

/**
 * One small bar chart: a labelled count above each bar, sized by percentage of the set's max -
 * the bar's own pixel height comes from its parent (`items-stretch`, the flex default), since a
 * `height: '100%'` style has nothing to resolve against otherwise.
 *
 * @param {object} props
 * @param {Array<{ label: string, count: number }>} props.bars - Labelled counts to chart.
 */
function BarRow({ bars }) {
    const maxCount = Math.max(...bars.map((bar) => bar.count), 0);

    return (
        <div className="flex gap-1.5" style={{ height: BAR_ROW_HEIGHT_PX }}>
            {bars.map((bar) => (
                <div key={bar.label} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[0.625rem] font-medium text-muted-foreground">
                        {bar.count > 0 ? bar.count : ''}
                    </span>
                    <div className="flex w-full flex-1 items-end">
                        <div
                            className="w-full rounded-t-sm bg-primary motion-safe:transition-[height]"
                            style={{
                                height: maxCount === 0 ? '2px' : `${(bar.count / maxCount) * 100}%`,
                            }}
                        />
                    </div>
                    <span className="text-[0.625rem] text-muted-foreground">{bar.label}</span>
                </div>
            ))}
        </div>
    );
}

/**
 * When you tend to succeed (weekday) and when you tend to focus (hour of day) - decision 19's
 * KPI 4, the only one of the five that is directly actionable.
 *
 * @param {object} props
 * @param {{ byWeekday: Array<{ weekday: number, successCount: number }>, byHourOfDay:
 *   Array<{ hour: number, sessionCount: number }> }} props.distribution -
 *   `computeDayTimeDistribution`'s result.
 */
export default function DayTimeDistributionCharts({ distribution }) {
    const weekdayBars = distribution.byWeekday.map((day) => ({
        label: WEEKDAY_LABELS[day.weekday],
        count: day.successCount,
    }));
    const hourBars = groupIntoHourBuckets(distribution.byHourOfDay).map((bucket) => ({
        label: bucket.label,
        count: bucket.sessionCount,
    }));
    const hasAnySuccess = weekdayBars.some((bar) => bar.count > 0);

    return (
        <section className="rounded-xl bg-card p-4 space-y-4">
            <div>
                <h2 className="text-sm font-semibold text-foreground">Successes by weekday</h2>
                <p className="mb-2 text-xs text-muted-foreground">
                    Which day of the week you complete the most habits on.
                </p>
                {hasAnySuccess ? (
                    <BarRow bars={weekdayBars} />
                ) : (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                        No completions logged in this period yet
                    </p>
                )}
            </div>

            {hourBars.some((bucket) => bucket.count > 0) && (
                <div>
                    <h2 className="text-sm font-semibold text-foreground">
                        Focus sessions by time of day
                    </h2>
                    <p className="mb-2 text-xs text-muted-foreground">
                        When you tend to start a timed session, in 4-hour blocks.
                    </p>
                    <BarRow bars={hourBars} />
                </div>
            )}
        </section>
    );
}
