'use client';

const VIEW_OPTIONS = [
    { value: 'sessions', label: 'Sessions' },
    { value: 'templates', label: 'Templates' },
];

/**
 * Switches which slice of the Timer page is shown: live sessions, or the template manager.
 *
 * @param {object} props
 * @param {'sessions'|'templates'} props.view - Currently selected view.
 * @param {(view: 'sessions'|'templates') => void} props.onChange - Called with the picked view.
 */
export default function TimerViewTabs({ view, onChange }) {
    return (
        <div className="flex gap-1.5" role="tablist" aria-label="Timer view">
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
