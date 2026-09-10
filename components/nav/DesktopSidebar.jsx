'use client';

import Link from 'next/link';
import { Search } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import SidebarNav from './SidebarNav';
import { openSearch } from './GlobalSearch';

/**
 * Persistent left sidebar shown at `lg` (1024px) and above — app name header
 * + search trigger, the shared SidebarNav content, and a theme toggle in the
 * footer.
 */
export default function DesktopSidebar() {
    return (
        <aside className="hidden lg:flex w-52 flex-shrink-0 flex-col border-r border-border bg-muted/40 p-3">
            <div className="flex items-center justify-between pb-4 px-2">
                <Link
                    href="/"
                    className="text-sm font-semibold text-foreground no-underline hover:text-muted-foreground"
                >
                    Task Tracker
                </Link>
                <button
                    onClick={openSearch}
                    aria-label="Search"
                    className="text-muted-foreground hover:text-foreground"
                >
                    <Search className="h-4 w-4" />
                </button>
            </div>
            <SidebarNav />
            <div className="mt-3 flex items-center justify-between border-t border-border px-2 pt-3">
                <span className="text-xs text-muted-foreground">Theme</span>
                <ThemeToggle />
            </div>
        </aside>
    );
}
