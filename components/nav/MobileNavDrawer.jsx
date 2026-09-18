'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import SidebarNav from './SidebarNav';

/**
 * Hamburger button + slide-in Sheet wrapping the shared SidebarNav content -
 * the mobile/tablet equivalent of DesktopSidebar, shown below `lg` (1024px).
 */
export default function MobileNavDrawer() {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <button
                onClick={() => setIsOpen(true)}
                aria-label="Open navigation"
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center text-foreground"
            >
                <Menu className="h-5 w-5" />
            </button>
            <SheetContent side="left" className="flex w-[80%] flex-col bg-sidebar p-3">
                <SheetHeader className="p-0 pb-4">
                    <SheetTitle className="text-[15px] font-semibold">Task Tracker</SheetTitle>
                </SheetHeader>
                <SidebarNav onNavigate={() => setIsOpen(false)} />
            </SheetContent>
        </Sheet>
    );
}
