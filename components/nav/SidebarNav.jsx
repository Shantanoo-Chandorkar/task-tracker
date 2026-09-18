'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useSpacesQuery } from '@/hooks/useSpacesQuery';
import { useListsQuery } from '@/hooks/useListsQuery';
import { LayoutGrid, Settings } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import LogoutButton from '@/components/nav/LogoutButton';

/**
 * Shared nav content: Spaces link, Space-grouped Lists, and Settings - framed by the caller.
 *
 * @param {object} props
 * @param {Function} [props.onNavigate] - Called after a link is clicked (used to close the mobile drawer)
 */
export default function SidebarNav({ onNavigate }) {
    const params = useParams();
    const pathname = usePathname();
    const currentListId = params?.listId;
    const isSpacesActive = pathname.startsWith('/spaces');

    const { data: spaces = [] } = useSpacesQuery();
    const { data: lists = [] } = useListsQuery();

    return (
        <nav className="flex flex-1 min-h-0 flex-col">
            <Link
                href="/spaces"
                onClick={onNavigate}
                className={`mb-4 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm no-underline ${
                    isSpacesActive
                        ? 'bg-sidebar-accent font-medium text-sidebar-primary'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent/60'
                }`}
            >
                <LayoutGrid className="h-4 w-4" />
                Spaces
            </Link>

            <div className="px-2 pb-2 text-[11px] font-semibold tracking-wider text-muted-foreground">
                LISTS
            </div>

            {/* Only this region scrolls - Spaces/Settings/Theme above and below stay fixed */}
            <div className="flex-1 min-h-0 space-y-4 overflow-y-auto">
                {spaces.map((space) => {
                    const spaceLists = lists.filter((list) => list.space_id === space.id);
                    if (spaceLists.length === 0) return null;

                    return (
                        <div key={space.id}>
                            <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
                                {space.name}
                            </div>
                            {spaceLists.map((list) => {
                                const isActive = list.id === currentListId;
                                return (
                                    <Link
                                        key={list.id}
                                        href={`/lists/${list.id}`}
                                        onClick={onNavigate}
                                        className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm no-underline ${
                                            isActive
                                                ? 'bg-sidebar-accent font-medium text-sidebar-primary'
                                                : 'text-sidebar-foreground hover:bg-sidebar-accent/60'
                                        }`}
                                    >
                                        <span className="flex min-w-0 items-center gap-2">
                                            <span
                                                className="h-2 w-2 flex-shrink-0 rounded-full"
                                                style={{
                                                    backgroundColor:
                                                        list.color || 'var(--sidebar-primary)',
                                                }}
                                            />
                                            <span className="truncate">{list.name}</span>
                                        </span>
                                        <span className="flex-shrink-0 font-mono text-xs text-metric">
                                            {list.task_count ?? 0}
                                        </span>
                                    </Link>
                                );
                            })}
                        </div>
                    );
                })}
            </div>

            <div className="mt-3 flex items-center gap-1 border-t border-sidebar-border pt-3">
                <Link
                    href="/settings"
                    onClick={onNavigate}
                    className="flex flex-1 items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground no-underline hover:text-sidebar-foreground"
                >
                    <Settings className="h-4 w-4" />
                    Settings
                </Link>
                <ThemeToggle />
                <LogoutButton onNavigate={onNavigate} />
            </div>
        </nav>
    );
}
