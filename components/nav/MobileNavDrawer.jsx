'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import ModalShell from '@/components/custom/ModalShell';
import SidebarNav from './SidebarNav';
import HabitZoneNav from '@/components/habits/HabitZoneNav';
import TimeTrackingNav from '@/components/timer/TimeTrackingNav';

/**
 * Hamburger button + slide-in Sheet wrapping the shared nav content -
 * the mobile/tablet equivalent of DesktopSidebar, shown below `lg` (1024px).
 *
 * @param {object} props
 * @param {object[]} [props.initialSpaces] - SSR-fetched spaces, forwarded to SidebarNav
 * @param {object[]} [props.initialLists] - SSR-fetched lists, forwarded to SidebarNav
 * @param {object|null} [props.initialProfile] - SSR-fetched profile, forwarded to the nav content
 */
export default function MobileNavDrawer({ initialSpaces, initialLists, initialProfile }) {
    const [isOpen, setIsOpen] = useState(false);
    const pathname = usePathname();
    const isHabitZone = pathname.startsWith('/habits');
    const isTimeTracking = pathname.startsWith('/timer');
    const zoneLabel = isHabitZone
        ? 'Habit Zone'
        : isTimeTracking
          ? 'Time Tracking'
          : 'Task Tracker';

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                aria-label="Open navigation"
                className="hit-area [--hit-size:44px] flex h-8 w-8 flex-shrink-0 items-center justify-center text-foreground"
            >
                <Menu className="h-5 w-5" />
            </button>
            <ModalShell
                open={isOpen}
                onClose={() => setIsOpen(false)}
                variant="sheet"
                side="left"
                title={zoneLabel}
                contentClassName="flex w-[80%] flex-col bg-sidebar p-3"
                headerClassName="p-0 pb-4"
                titleClassName="text-[0.9375rem] font-semibold"
            >
                {isHabitZone ? (
                    <HabitZoneNav
                        onNavigate={() => setIsOpen(false)}
                        initialProfile={initialProfile}
                    />
                ) : isTimeTracking ? (
                    <TimeTrackingNav
                        onNavigate={() => setIsOpen(false)}
                        initialProfile={initialProfile}
                    />
                ) : (
                    <SidebarNav
                        onNavigate={() => setIsOpen(false)}
                        initialSpaces={initialSpaces}
                        initialLists={initialLists}
                        initialProfile={initialProfile}
                    />
                )}
            </ModalShell>
        </>
    );
}
