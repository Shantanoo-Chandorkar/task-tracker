'use client';

import { usePathname } from 'next/navigation';
import QuickCreateFab from './QuickCreateFab';
import HabitQuickCreateFab from '@/components/habits/HabitQuickCreateFab';
import TimeTrackingQuickCreateFab from '@/components/timer/TimeTrackingQuickCreateFab';

/**
 * Picks the zone-appropriate FAB for the desktop shell, which (unlike BottomNav) is a Server
 * Component and so cannot read the pathname itself.
 *
 * @param {object} props
 * @param {string} props.className - Positioning + sizing classes for the button itself
 */
export default function DesktopQuickCreateFab({ className }) {
    const pathname = usePathname();
    if (pathname.startsWith('/habits')) return <HabitQuickCreateFab className={className} />;
    if (pathname.startsWith('/timer')) return <TimeTrackingQuickCreateFab className={className} />;
    return <QuickCreateFab className={className} />;
}
