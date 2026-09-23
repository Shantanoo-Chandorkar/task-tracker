'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import ModalShell from '@/components/ui/modal-shell';
import SidebarNav from './SidebarNav';

/**
 * Hamburger button + slide-in Sheet wrapping the shared SidebarNav content -
 * the mobile/tablet equivalent of DesktopSidebar, shown below `lg` (1024px).
 */
export default function MobileNavDrawer() {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                aria-label="Open navigation"
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center text-foreground"
            >
                <Menu className="h-5 w-5" />
            </button>
            <ModalShell
                open={isOpen}
                onClose={() => setIsOpen(false)}
                variant="sheet"
                side="left"
                title="Task Tracker"
                contentClassName="flex w-[80%] flex-col bg-sidebar p-3"
                headerClassName="p-0 pb-4"
                titleClassName="text-[15px] font-semibold"
            >
                <SidebarNav onNavigate={() => setIsOpen(false)} />
            </ModalShell>
        </>
    );
}
