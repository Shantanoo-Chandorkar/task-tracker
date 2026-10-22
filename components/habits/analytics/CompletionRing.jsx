const RING_RADIUS = 36;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * A small ring showing a 0-1 completion rate - hand-rolled SVG, matching
 * `TrackedTimeBreakdown.jsx`'s no-library approach; reused by every completion ring in the app.
 *
 * @param {object} props
 * @param {number} props.rate - Completion rate, 0 to 1.
 */
export default function CompletionRing({ rate }) {
    const dashoffset = RING_CIRCUMFERENCE * (1 - rate);
    return (
        <div className="relative h-[88px] w-[88px] flex-shrink-0">
            <svg width="88" height="88" viewBox="0 0 88 88" className="-rotate-90">
                <circle
                    cx="44"
                    cy="44"
                    r={RING_RADIUS}
                    className="fill-none stroke-border"
                    strokeWidth="8"
                />
                <circle
                    cx="44"
                    cy="44"
                    r={RING_RADIUS}
                    className="fill-none stroke-primary motion-safe:transition-[stroke-dashoffset]"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={RING_CIRCUMFERENCE}
                    strokeDashoffset={dashoffset}
                />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-lg font-semibold text-foreground">
                {Math.round(rate * 100)}%
            </div>
        </div>
    );
}
