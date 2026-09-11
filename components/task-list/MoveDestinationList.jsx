'use client';

/**
 * Move destinations for the mobile "Move to..." Sheet — plain buttons, not a Radix menu, for bigger touch targets.
 *
 * @param {object} props
 * @param {{ id: string, label: string }[]} props.destinations - Move targets to list
 * @param {Function} props.onSelect - Called with the chosen destination's id
 */
export default function MoveDestinationList({ destinations, onSelect }) {
    return (
        <div className="flex flex-col overflow-y-auto">
            {destinations.map((destination) => (
                <button
                    key={destination.id}
                    type="button"
                    onClick={() => onSelect(destination.id)}
                    className="w-full min-h-11 rounded-md px-3 py-3 text-left text-sm hover:bg-accent active:bg-accent"
                >
                    {destination.label}
                </button>
            ))}
        </div>
    );
}
