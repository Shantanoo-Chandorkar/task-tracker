'use client';

import Link from 'next/link';

/**
 * A titled list of links (recent lists or sublists) on the Home screen.
 *
 * @param {object} props
 * @param {string} props.title - Section heading.
 * @param {{ id: string, href: string, name: string, color: string|null, subtitle: string }[]} props.links - Rows to show.
 * @param {string} props.emptyMessage - Shown when there are no links.
 * @returns {JSX.Element}
 */
export default function HomeLinkSection({ title, links, emptyMessage }) {
    return (
        <section aria-label={title}>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {title}
            </h2>
            {links.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                    {emptyMessage}
                </p>
            ) : (
                <ul className="rounded-md border border-border divide-y divide-border/60">
                    {links.map((link) => (
                        <li key={link.id}>
                            <Link
                                href={link.href}
                                className="flex items-center gap-2 px-3 py-3 hover:bg-muted/50 motion-safe:transition-colors"
                            >
                                <span
                                    className="h-2 w-2 flex-shrink-0 rounded-full bg-muted-foreground/40"
                                    style={link.color ? { backgroundColor: link.color } : undefined}
                                />
                                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                                    {link.name}
                                </span>
                                <span className="flex-shrink-0 text-xs text-muted-foreground">
                                    {link.subtitle}
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
