'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCurrentUserProfileQuery } from '@/hooks/useCurrentUserProfileQuery';
import { ListChecks, LayoutGrid, ArrowLeftRight, Timer } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import LogoutButton from '@/components/nav/LogoutButton';

/**
 * Sidebar content for the Habit Zone - the mirror of SidebarNav.jsx for the Task Tracker side.
 *
 * @param {object} props
 * @param {Function} [props.onNavigate] - Called after a link is clicked (used to close the mobile drawer)
 * @param {object|null} [props.initialProfile] - SSR-fetched profile, so the footer name never hydration-mismatches
 */
export default function HabitZoneNav({ onNavigate, initialProfile }) {
    const pathname = usePathname();
    const isHabitsActive = pathname === '/habits';
    const isCategoriesActive = pathname.startsWith('/habits/categories');

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
        <nav aria-label="Main" className="flex flex-1 min-h-0 flex-col">
            <Link
                href="/habits"
                aria-current={isHabitsActive ? 'page' : undefined}
                onClick={onNavigate}
                className={`mb-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm no-underline ${
                    isHabitsActive
                        ? 'bg-sidebar-accent font-medium text-sidebar-primary'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent/60'
                }`}
            >
                <ListChecks aria-hidden="true" className="h-4 w-4" />
                Habits
            </Link>

            <Link
                href="/habits/categories"
                aria-current={isCategoriesActive ? 'page' : undefined}
                onClick={onNavigate}
                className={`mb-4 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm no-underline ${
                    isCategoriesActive
                        ? 'bg-sidebar-accent font-medium text-sidebar-primary'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent/60'
                }`}
            >
                <LayoutGrid aria-hidden="true" className="h-4 w-4" />
                Categories
            </Link>

            <div className="flex-1 min-h-0" />

            <div className="mt-3 flex flex-col pt-3 border-t border-sidebar-border">
                <Link
                    href="/"
                    onClick={onNavigate}
                    className="flex items-center gap-2 rounded-md px-2 py-2 text-sm mb-2 no-underline text-sidebar-foreground hover:bg-sidebar-accent/60"
                >
                    <ArrowLeftRight aria-hidden="true" className="h-4 w-4" />
                    Switch to Task Tracker
                </Link>
                <Link
                    href="/timer"
                    onClick={onNavigate}
                    className="flex items-center gap-2 rounded-md px-2 py-2 text-sm mb-2 no-underline text-sidebar-foreground hover:bg-sidebar-accent/60"
                >
                    <Timer aria-hidden="true" className="h-4 w-4" />
                    Switch to Time Tracking
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
