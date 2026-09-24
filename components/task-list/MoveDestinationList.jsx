'use client';

import { CornerDownRight } from 'lucide-react';

/**
 * Move destinations for the mobile "Move to..." Sheet - plain buttons, not a Radix menu, for bigger touch targets.
 *
 * @param {object} props
 * @param {object[]} props.destinations - Move targets to list, each an isLabel/isSublist/isTask row
 * @param {Function} props.onSelect - Called with the chosen task's id
 * @param {Function} props.onSelectSublist - Called with the chosen sublist's id (or null for Main List)
 */
export default function MoveDestinationList({ destinations, onSelect, onSelectSublist }) {
    return (
        <div className="flex flex-col overflow-y-auto">
            {destinations.map((destination) => {
                if (destination.isLabel) {
                    return (
                        <div
                            key={destination.id}
                            className="px-3 py-2 text-sm font-semibold text-foreground mt-2 first:mt-0 flex items-center gap-2"
                        >
                            <span
                                className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                                style={{ backgroundColor: destination.color || 'var(--primary)' }}
                            />
                            {destination.label}
                        </div>
                    );
                }

                if (destination.isSublist) {
                    return (
                        <button
                            key={destination.id}
                            type="button"
                            onClick={() => onSelectSublist(destination.sublistId)}
                            className="w-full min-h-11 rounded-md px-3 py-3 text-left text-sm hover:bg-accent active:bg-accent flex items-center gap-2 text-muted-foreground"
                        >
                            <CornerDownRight className="h-3.5 w-3.5 shrink-0" />
                            {destination.label}
                        </button>
                    );
                }

                const isSubtask = destination.depth > 0;
                return (
                    <button
                        key={destination.id}
                        type="button"
                        onClick={() => onSelect(destination.targetId)}
                        className={`w-full h-auto min-h-11 rounded-md py-3 pr-3 text-left text-sm hover:bg-accent active:bg-accent break-words flex items-center gap-2 ${isSubtask ? 'text-muted-foreground' : ''}`}
                        style={{ paddingLeft: `calc(0.75rem + ${destination.depth} * 1rem)` }}
                    >
                        {isSubtask && <CornerDownRight className="h-3.5 w-3.5 shrink-0" />}
                        {destination.label}
                    </button>
                );
            })}
        </div>
    );
}
