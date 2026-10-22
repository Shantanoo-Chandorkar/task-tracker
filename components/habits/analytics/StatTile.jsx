/**
 * One labeled value in its own card - a generic building block for a row of small stats, so a
 * streak tile and a tracked-time tile share one shape instead of two near-identical components.
 *
 * @param {object} props
 * @param {string} props.label - What the value measures, e.g. "Current streak".
 * @param {string} props.value - The value to show, already formatted, e.g. "12d".
 */
export default function StatTile({ label, value }) {
    return (
        <div className="flex flex-col justify-center rounded-xl bg-card p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold text-foreground">{value}</p>
        </div>
    );
}
