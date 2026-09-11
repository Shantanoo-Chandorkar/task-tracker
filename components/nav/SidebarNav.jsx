'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { LayoutGrid, Settings } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import SyncIssueBadge from '@/components/nav/SyncIssueBadge';

/**
 * Shared nav content: Spaces link, Space-grouped Lists, and Settings — framed by the caller.
 *
 * @param {object} props
 * @param {Function} [props.onNavigate] - Called after a link is clicked (used to close the mobile drawer)
 */
export default function SidebarNav({ onNavigate }) {
    const params = useParams();
    const pathname = usePathname();
    const currentListId = params?.listId;
    const isSpacesActive = pathname.startsWith('/spaces');

    const { data: spaces = [] } = useQuery({
        queryKey: ['spaces'],
        queryFn: async () => {
            const response = await fetch('/api/spaces');
            if (!response.ok) throw new Error('Failed to fetch spaces');
            return response.json();
        },
    });

    const { data: lists = [] } = useQuery({
        queryKey: ['lists'],
        queryFn: async () => {
            const response = await fetch('/api/lists');
            if (!response.ok) throw new Error('Failed to fetch lists');
            return response.json();
        },
    });

    return (
        <nav className="flex flex-1 flex-col overflow-y-auto">
            <Link
                href="/spaces"
                onClick={onNavigate}
                className={`mb-3 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm no-underline ${
                    isSpacesActive
                        ? 'bg-background font-medium text-primary'
                        : 'text-foreground hover:bg-background/60'
                }`}
            >
                <LayoutGrid className="h-4 w-4" />
                Spaces
            </Link>

            <div className="flex-1 space-y-4">
                {spaces.map((space) => {
                    const spaceLists = lists.filter((list) => list.space_id === space.id);
                    if (spaceLists.length === 0) return null;

                    return (
                        <div key={space.id}>
                            <div className="px-2 pb-1 text-xs font-semibold text-muted-foreground truncate">
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
                                                ? 'bg-background font-medium text-primary'
                                                : 'text-foreground hover:bg-background/60'
                                        }`}
                                    >
                                        <span className="truncate">{list.name}</span>
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

            <Link
                href="/settings"
                onClick={onNavigate}
                className="mt-auto flex items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground no-underline hover:text-foreground"
            >
                <span className="relative">
                    <Settings className="h-4 w-4" />
                    <SyncIssueBadge />
                </span>
                Settings
            </Link>

            <div className="mt-3 flex items-center justify-between border-t border-border px-2 pt-3">
                <span className="text-xs text-muted-foreground">Theme</span>
                <ThemeToggle />
            </div>
        </nav>
    );
}
