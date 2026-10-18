'use client';

const VIEW_OPTIONS = [
    { value: 'today', label: 'Today' },
    { value: 'all', label: 'All' },
    { value: 'byCategory', label: 'By Category' },
];

/**
 * Switches which slice of the caller's habits `HabitListView` shows.
 *
 * @param {object} props
 * @param {'today'|'all'|'byCategory'} props.view - Currently selected view.
 * @param {(view: 'today'|'all'|'byCategory') => void} props.onChange - Called with the picked view.
 */
export default function HabitViewTabs({ view, onChange }) {
    return (
        <div className="flex gap-1.5" role="tablist" aria-label="Habit view">
            {VIEW_OPTIONS.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    role="tab"
                    aria-selected={view === option.value}
                    onClick={() => onChange(option.value)}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium motion-safe:transition-colors ${
                        view === option.value
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
