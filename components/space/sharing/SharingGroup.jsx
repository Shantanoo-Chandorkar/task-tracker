'use client';

/**
 * A titled box that lists people or invites, with a divider between rows.
 *
 * @param {object} props
 * @param {string} props.title - Small heading above the box, e.g. "Collaborators"
 * @param {import('react').ReactNode} props.children - `SharingRow` elements
 */
export function SharingGroup({ title, children }) {
    return (
        <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">{title}</p>
            <div className="rounded-lg bg-muted/50 divide-y divide-border">{children}</div>
        </div>
    );
}

/**
 * One row of a `SharingGroup`: what it is about on the left, its controls on the right.
 *
 * @param {object} props
 * @param {import('react').ReactNode} props.children - The row's two halves
 */
export function SharingRow({ children }) {
    return <div className="flex items-center justify-between gap-2 px-3 py-2">{children}</div>;
}
