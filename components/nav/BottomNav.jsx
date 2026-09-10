'use client';

import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { ListChecks, LayoutGrid, Settings } from 'lucide-react';
import QuickCreateFab from './QuickCreateFab';

/**
 * Mobile bottom navigation — Tasks / Spaces / Settings, with a raised center
 * FAB that opens the New Task / New List / New Space speed-dial. Hidden at
 * `lg` (1024px) and above (the desktop sidebar + its own FAB cover
 * navigation there instead). The Tasks tab goes to the current list when one
 * is in scope, otherwise to `/`, which dynamically redirects to whichever
 * list is actually first — not a hardcoded fallback.
 */
export default function BottomNav() {
    const pathname = usePathname();
    const params = useParams();
    const listId = params?.listId;

    const isTasks = pathname.startsWith('/lists');
    const isSpaces = pathname.startsWith('/spaces');
    const isSettings = pathname.startsWith('/settings');

    return (
        // Three real destinations can't split evenly around a center FAB by item
        // count (1 left, 2 right) — so the FAB isn't a flex sibling at all. The
        // row is two EQUAL-width flex-1 groups (Tasks alone | Spaces+Settings
        // together) with a fixed-width spacer between them exactly as wide as
        // the FAB, which is then absolutely centered over that spacer — that's
        // what makes it land at true 50%, not wherever 3 unevenly-grouped links
        // happen to leave a gap.
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-20 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]">
            <div className="relative flex items-center">
                <div className="flex-1 flex">
                    <Link
                        href={listId ? `/lists/${listId}` : '/'}
                        className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] ${isTasks ? 'text-primary' : 'text-muted-foreground'}`}
                    >
                        <ListChecks className="h-5 w-5" />
                        Tasks
                    </Link>
                </div>

                <div className="w-12 flex-shrink-0" aria-hidden="true" />

                <div className="flex-1 flex">
                    <Link
                        href="/spaces"
                        className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] ${isSpaces ? 'text-primary' : 'text-muted-foreground'}`}
                    >
                        <LayoutGrid className="h-5 w-5" />
                        Spaces
                    </Link>

                    <Link
                        href="/settings"
                        className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] ${isSettings ? 'text-primary' : 'text-muted-foreground'}`}
                    >
                        <Settings className="h-5 w-5" />
                        Settings
                    </Link>
                </div>

                <QuickCreateFab className="absolute left-1/2 -top-4 -translate-x-1/2 h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center" />
            </div>
        </nav>
    );
}
