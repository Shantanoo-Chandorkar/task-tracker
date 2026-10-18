'use client';

const PERIOD_OPTIONS = [
    { value: 7, label: 'Last 7 days' },
    { value: 30, label: 'Last 30 days' },
    { value: 90, label: 'Last 90 days' },
    { value: 365, label: 'Last 365 days' },
];

/**
 * Switches how many trailing days of data the analytics sections aggregate over. A 2x2 grid
 * below 500px - 4 pills in one row wrap their own text and turn tall and cramped on a phone.
 *
 * @param {object} props
 * @param {number} props.periodDays - Currently selected window length, in days.
 * @param {(periodDays: number) => void} props.onChange - Called with the picked window length.
 */
export default function AnalyticsPeriodTabs({ periodDays, onChange }) {
    return (
        <div
            className="grid grid-cols-2 gap-1.5 min-[500px]:flex"
            role="tablist"
            aria-label="Analytics period"
        >
            {PERIOD_OPTIONS.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    role="tab"
                    aria-selected={periodDays === option.value}
                    onClick={() => onChange(option.value)}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium motion-safe:transition-colors ${
                        periodDays === option.value
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-muted'
                    }`}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}
