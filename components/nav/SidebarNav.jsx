'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useSpacesQuery } from '@/hooks/useSpacesQuery';
import { useListsQuery } from '@/hooks/useListsQuery';
import { useCurrentUserProfileQuery } from '@/hooks/useCurrentUserProfileQuery';
import { Home, LayoutGrid, Settings } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import LogoutButton from '@/components/nav/LogoutButton';

/**
 * Shared nav content: Home and Spaces links, Space-grouped Lists, and Settings - framed by the caller.
 *
 * @param {object} props
 * @param {Function} [props.onNavigate] - Called after a link is clicked (used to close the mobile drawer)
 * @param {object[]} [props.initialSpaces] - SSR-fetched spaces, so the LISTS section never hydration-mismatches
 * @param {object[]} [props.initialLists] - SSR-fetched lists, so the LISTS section never hydration-mismatches
 * @param {object|null} [props.initialProfile] - SSR-fetched profile, so the footer name never hydration-mismatches
 */
export default function SidebarNav({ onNavigate, initialSpaces, initialLists, initialProfile }) {
    const params = useParams();
    const pathname = usePathname();
    const currentListId = params?.listId;
    const isHomeActive = pathname === '/';
    const isSpacesActive = pathname.startsWith('/spaces');

    const { data: spaces = [] } = useSpacesQuery({ initialData: initialSpaces });
    const { data: lists = [] } = useListsQuery({ initialData: initialLists });
    const { data: profile } = useCurrentUserProfileQuery({ initialData: initialProfile });

    const displayName = profile?.is_guest
        ? 'Guest'
        : profile?.display_name || profile?.email || 'User';
    const initials = displayName
        .split(' ')
        .filter(Boolean)
        .map((namePart) => namePart[0])
        .join('')
        .substring(0, 2)
        .toUpperCase();

    return (
        <nav className="flex flex-1 min-h-0 flex-col">
            <Link
                href="/"
                onClick={onNavigate}
                className={`mb-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm no-underline ${
                    isHomeActive
                        ? 'bg-sidebar-accent font-medium text-sidebar-primary'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent/60'
                }`}
            >
                <Home className="h-4 w-4" />
                Home
            </Link>

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

            <div className="mt-3 flex flex-col pt-3 border-t border-sidebar-border">
                <Link
                    href="/settings"
                    onClick={onNavigate}
                    className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent/60 mb-2 no-underline"
                >
                    <Settings className="h-4 w-4" />
                    Settings
                </Link>
                <div className="h-px w-full bg-sidebar-border mb-2" />
                <div className="flex items-center gap-2 px-2 py-1">
                    <div className="h-8 w-8 rounded-full bg-primary flex flex-shrink-0 items-center justify-center text-primary-foreground text-xs font-semibold">
                        {initials}
                    </div>
                    <div className="flex-1 truncate text-sm font-medium text-sidebar-foreground">
                        {displayName}
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1">
                        <ThemeToggle />
                        <LogoutButton onNavigate={onNavigate} initialProfile={initialProfile} />
                    </div>
                </div>
            </div>
        </nav>
    );
}
