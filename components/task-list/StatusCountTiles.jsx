'use client';

/**
 * Horizontal row of per-status count tiles above the task list. Tapping a
 * tile filters the list down to just that status; tapping the active tile
 * again clears the filter. Counts read from data the list already has in
 * memory — no separate fetch.
 *
 * @param {object} props
 * @param {object[]} props.statuses - Statuses with at least id/name/color
 * @param {Object<string, number>} props.countsByStatusId - Root task count per status id
 * @param {string|null} props.activeStatusId - Currently filtered status, or null
 * @param {Function} props.onSelect - Called with the tapped status id
 */
export default function StatusCountTiles({ statuses, countsByStatusId, activeStatusId, onSelect }) {
    const visibleStatuses = statuses.filter((status) => (countsByStatusId[status.id] ?? 0) > 0);
    if (visibleStatuses.length === 0) return null;

    return (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {visibleStatuses.map((status) => {
                const isActive = activeStatusId === status.id;
                return (
                    <button
                        key={status.id}
                        onClick={() => onSelect(status.id)}
                        className={`flex items-center gap-1.5 flex-shrink-0 rounded-lg px-3 py-2 border motion-safe:transition-colors ${
                            isActive ? 'border-primary bg-primary/10' : 'border-transparent bg-card'
                        }`}
                    >
                        <span
                            className="h-2 w-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: status.color }}
                        />
                        <span className="font-mono text-sm font-semibold text-metric">
                            {countsByStatusId[status.id] ?? 0}
                        </span>
                        <span className="text-xs text-muted-foreground">{status.name}</span>
                    </button>
                );
            })}
        </div>
    );
}
