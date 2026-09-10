'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import SidebarNav from './SidebarNav';

/**
 * Hamburger button + slide-in Sheet wrapping the shared SidebarNav content —
 * the mobile/tablet equivalent of DesktopSidebar, shown below `lg` (1024px).
 */
export default function MobileNavDrawer() {
    const [open, setOpen] = useState(false);

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <button
                onClick={() => setOpen(true)}
                aria-label="Open navigation"
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center text-foreground"
            >
                <Menu className="h-5 w-5" />
            </button>
            <SheetContent side="left" className="flex w-72 flex-col p-3">
                <SheetHeader className="p-0 pb-2">
                    <SheetTitle>Task Tracker</SheetTitle>
                </SheetHeader>
                <SidebarNav onNavigate={() => setOpen(false)} />
            </SheetContent>
        </Sheet>
    );
}
