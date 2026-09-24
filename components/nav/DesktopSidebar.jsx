'use client';

import Link from 'next/link';
import { Search } from 'lucide-react';
import SidebarNav from './SidebarNav';
import { openSearch } from './GlobalSearch';

/**
 * Persistent left sidebar shown at `lg` (1024px) and above - app name header,
 * search trigger, and the shared SidebarNav content.
 *
 * @param {object} props
 * @param {object[]} props.initialSpaces - SSR-fetched spaces, forwarded to SidebarNav
 * @param {object[]} props.initialLists - SSR-fetched lists, forwarded to SidebarNav
 * @param {object|null} props.initialProfile - SSR-fetched profile, forwarded to SidebarNav
 */
export default function DesktopSidebar({ initialSpaces, initialLists, initialProfile }) {
    return (
        <aside className="hidden lg:flex sticky top-0 h-screen w-[20%] flex-shrink-0 flex-col border-r border-border bg-sidebar p-3">
            <Link
                href="/"
                className="mb-4 flex items-center gap-2 px-2 text-[15px] font-semibold text-foreground no-underline"
            >
                Task Tracker
            </Link>
            <button
                onClick={openSearch}
                className="mb-4 flex items-center justify-between gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
                <span className="flex items-center gap-2">
                    <Search className="h-3.5 w-3.5" />
                    Quick Search
                </span>
                <kbd className="rounded border border-border bg-muted px-1 text-[10px]">⌘K</kbd>
            </button>
            <SidebarNav
                initialSpaces={initialSpaces}
                initialLists={initialLists}
                initialProfile={initialProfile}
            />
        </aside>
    );
}
