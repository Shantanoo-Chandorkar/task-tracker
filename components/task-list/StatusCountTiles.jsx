'use client';

import { hexToRgba } from '@/lib/color';

/**
 * Per-status count pills above the task list, plus an "All Tasks" pill that clears the filter.
 * Tapping a status pill filters to it, tapping again (or tapping "All Tasks") clears it.
 *
 * @param {object} props
 * @param {object[]} props.statuses - Statuses with at least id/name/color
 * @param {Object<string, number>} props.countsByStatusId - Root task count per status id
 * @param {number} props.totalCount - Total task count across all statuses, for the "All Tasks" pill
 * @param {string|null} props.activeStatusId - Currently filtered status, or null
 * @param {Function} props.onSelect - Called with the tapped status id, or null for "All Tasks"
 */
export default function StatusCountTiles({
    statuses,
    countsByStatusId,
    totalCount,
    activeStatusId,
    onSelect,
}) {
    const visibleStatuses = statuses.filter((status) => (countsByStatusId[status.id] ?? 0) > 0);
    if (visibleStatuses.length === 0) return null;

    return (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            <button
                onClick={() => onSelect(null)}
                className={`flex items-center gap-1.5 flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold motion-safe:transition-colors ${
                    activeStatusId === null
                        ? 'bg-foreground text-background'
                        : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
            >
                All Tasks
                <span className="font-mono">{totalCount}</span>
            </button>
            {visibleStatuses.map((status) => {
                const isActive = activeStatusId === status.id;
                return (
                    <button
                        key={status.id}
                        onClick={() => onSelect(status.id)}
                        className="flex items-center gap-1.5 flex-shrink-0 rounded-full px-3 py-1.5 text-xs motion-safe:transition-colors"
                        style={{
                            backgroundColor: isActive
                                ? hexToRgba(status.color, 0.18)
                                : hexToRgba(status.color, 0.08),
                            color: isActive ? status.color : undefined,
                        }}
                    >
                        <span
                            className="h-2 w-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: status.color }}
                        />
                        <span className={isActive ? '' : 'text-muted-foreground'}>
                            {status.name}
                        </span>
                        <span className="font-mono font-semibold">
                            {countsByStatusId[status.id] ?? 0}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
